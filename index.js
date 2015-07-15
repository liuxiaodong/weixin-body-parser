var formidable = require('formidable');
var getBody = require('raw-body');
var typeis = require('type-is');
var http = require('http');
var qs = require('qs');
var path = require('path');
var parseString = require('xml2js').parseString;
var WXBizMsgCrypt = require('wechat-crypto');
var regexp = /^(text\/xml|application\/([\w!#\$%&\*`\-\.\^~]+\+)?xml)$/i;


exports = module.exports = bodyParser;

function bodyParser(options) {
  options = options || {};
  var _urlencoded = urlencoded(options);
  var _json = json(options);
  var _multipart = multipart(options);
  var _xml = xml(options);

  return function bodyParser(req, res, next) {
    if (!hasBody(req)) {
      return next();
    }

    if(typeis(req) === 'multipart/form-data'){ // form 表单提交 图片
      _multipart(req, res, next);
    }else if(regexp.test(mime(req))){ // xml
      _xml(req, res, next);
    }else {
      getBody(req, {
        limit: options.limit || '100kb',
        length: req.headers['content-length'],
        encoding: 'utf8'
      }, function (err, buf) {
        if(err){
          return next(err);
        }
        req.rawBuf = buf;
        _json(req, res, function(err) {
          if (err) {
            return next(err);
          }
          _urlencoded(req, res, next);
        });
      });
    }
  };
}

function json(options) {
  var strict = options.strict !== false;

  return function jsonParser(req, res, next) {
    req.body = req.body || {};

    if (!typeis(req, 'json')) {
      return next();
    }

    var first = req.rawBuf.trim()[0];

    if (0 === req.rawBuf.length) {
      return next(error(400, 'invalid json, empty body'));
    }

    if (strict && '{' != first && '[' != first) {
      return next(error(400, 'invalid json'));
    }
    try {
      req.body = JSON.parse(req.rawBuf, options.reviver);
    } catch (err) {
      err.body = req.rawBuf;
      err.status = 400;
      return next(err);
    }
    next();
  };
}

function urlencoded() {
  return function urlencodedParser(req, res, next) {
    if (req._body) {
      return next();
    }
    req.body = req.body || {};

    if (!typeis(req, 'urlencoded')) {
      return next();
    }

    // flag as parsed
    req._body = true;

    try {
      req.body = req.rawBuf.length ? qs.parse(req.rawBuf) : {};
    } catch (error) {
      error.body = req.rawBuf;
      return next(error);
    }
    next();
  };
}

// 表单 图片
function multipart(options){
  return function multipartParser(req, res, next) {
    var form = new formidable.IncomingForm
    , data = []
    , done;

    Object.keys(options).forEach(function(key){
      form[key] = options[key];
    });
    form['uploadDir'] === '/dev';
    // override formidable's default onPart
    // save upload file into redis with expire
    form.onPart = function(part){
      var ext = path.extname(part.filename);
      function genKey(){
        // 得到原始图片后缀名
        return "null";
      }

      // let formidable handle all non-file parts
      if(!part.filename) return form.handlePart(part);
      var key = genKey();

      var file = {
        path : key,
        name : part.filename,
        type : part.mime,
        ext  : ext,
        size : 0,
        createTime : undefined
      };

    form.emit('fileBegin',"file",file);
      var _buff = "";
      part.on('data',function(buffer){
        form.pause();
        file.size += buffer.length;
        _buff += buffer.toString('binary');
        form.resume();
      });

      part.on('end',function(){
        file.createTime = (new Date()).toISOString();
        file.binaryBuff = _buff;
        form.emit('file',part.name,file);
      });

    };

    function ondata(name, val){
      data.push({name:name, value:val});
    }

    form.on('field', ondata);
    form.on('file', ondata);
    form.on('end', function(){
      var parseData = function(){
        if (done) return;
        try {
          req.body = mergeArray(data);
          next();
        } catch (err) {
          next(err);
        }
      };
      parseData();
    });

    form.on('error', function(err){
      next(err);
      done = true;
    });

    form.parse(req);
    
  };
}


function mergeArray(array){
  var ret = { base: {} };
  array.forEach(function(obj){
    merge(ret, obj.name, obj.value);
  });
  return ret.base;
}

/**
 * Merge parent key/val pair.
 */

function merge(parent, key, val){
  if (~key.indexOf(']')) {
    var parts = key.split('[')
      , len = parts.length
      , last = len - 1;
    parse(parts, parent, 'base', val);
    // optimize
  } else {
    if (notint.test(key) && Array.isArray(parent.base)) {
      var t = {};
      for (var k in parent.base) t[k] = parent.base[k];
      parent.base = t;
    }
    set(parent.base, key, val);
  }

  return parent;
}

function parse(parts, parent, key, val) {
  var part = parts.shift();
  // end
  if (!part) {
    if (Array.isArray(parent[key])) {
      parent[key].push(val);
    } else if ('object' == typeof parent[key]) {
      parent[key] = val;
    } else if ('undefined' == typeof parent[key]) {
      parent[key] = val;
    } else {
      parent[key] = [parent[key], val];
    }
    // array
  } else {
    var obj = parent[key] = parent[key] || [];
    if (']' == part) {
      if (Array.isArray(obj)) {
        if ('' != val) obj.push(val);
      } else if ('object' == typeof obj) {
        obj[Object.keys(obj).length] = val;
      } else {
        obj = parent[key] = [parent[key], val];
      }
      // prop
    } else if (~part.indexOf(']')) {
      part = part.substr(0, part.length - 1);
      if(notint.test(part) && Array.isArray(obj)) obj = promote(parent, key);
      parse(parts, obj, part, val);
      // key
    } else {
      if(notint.test(part) && Array.isArray(obj)) obj = promote(parent, key);
      parse(parts, obj, part, val);
    }
  }
}

/**
 * Cache non-integer test regexp.
 */

var notint = /[^0-9]/;

function promote(parent, key) {
  if (parent[key].length == 0) return parent[key] = {};
  var t = {};
  for (var i in parent[key]) t[i] = parent[key][i];
  parent[key] = t;
  return t;
}

/**
 * Set `obj`'s `key` to `val` respecting
 * the weird and wonderful syntax of a qs,
 * where "foo=bar&foo=baz" becomes an array.
 *
 * @param {Object} obj
 * @param {String} key
 * @param {String} val
 * @api private
 */

function set(obj, key, val) {
  var v = obj[key];
  if (undefined === v) {
    obj[key] = val;
  } else if (Array.isArray(v)) {
    v.push(val);
  } else {
    obj[key] = [v, val];
  }
}

/**
 * Locate last brace in `str` within the key.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function lastBraceInKey(str) {
  var len = str.length
    , brace
    , c;
  for (var i = 0; i < len; ++i) {
    c = str[i];
    if (']' == c) brace = false;
    if ('[' == c) brace = true;
    if ('=' == c && !brace) return i;
  }
}



function xml(options) {
  var defaultOptions = {
    async: true,
    explicitArray: true,
    normalize: true,
    trim: true
  };


  /**
    * 字符串格式化
    * keep: 保持不变
    * lowerCase: 转为消息
    * underscored: 转为下划线形式
    */
  var defaultFormatStr = {
    keep: function(str){
      return str.trim();
    },
    lowerCase: function(str){
      return str.trim().toLowerCase();
    },
    underscored: function(str){
      return str.trim().replace(/([a-z\d])([A-Z]+)/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase();
    }
  };

  var attrNameProcessors = defaultFormatStr[options.attrNameProcessors || 'underscored'];
  if(!attrNameProcessors) {
    attrNameProcessors = defaultFormatStr.underscored;
  }

  /**
    * 对微信事件消息数据的 KEY 的转换
    */

  var _toString = Object.prototype.toString;
  var _format = function(data){   
    if(data){
      for(var p in data){
        var value = data[p];
        var prot = p;
        if(typeof prot == 'string') prot = attrNameProcessors(prot);
        if(prot !== p){
          data[prot] = value;
          delete data[p];
        }
        if(_toString.call(value) == '[object Array]' || _toString.call(value) == '[object Object]') {
          if(_toString.call(value) == '[object Array]' && value.length === 1){
            data[prot] = value[0];
          }
          _format(data[prot]);
        }
      }
    }
  };

  var parserOptions = extend(defaultOptions, options);
  var crypter;
  if(parserOptions.token && parserOptions.encrypt_key && parserOptions.app_id){
    crypter = new WXBizMsgCrypt(parserOptions.token, parserOptions.encrypt_key, parserOptions.app_id);
  }
  delete parserOptions.token;
  delete parserOptions.encrypt_key;
  delete parserOptions.app_id;
  
  return function (req, res, next) {
    var data = '';

    req.body = req.body || {};

    req._body = true;

    getBody(req, {
      limit: options.limit || '100kb',
      length: req.headers['content-length'],
      encoding: 'utf8'
    }, function (err, buf) {
      parseString(buf, parserOptions, function(err, xml) {
        if (err) {
          err.status = 400;
          return next(err);
        }

        if(!xml) return next();

        req.rawBuf = buf;

        var data = xml.xml;
        _format(data);

        if(crypter && data.encrypt){
          var message = crypter.decrypt(data.encrypt).message;

          parseString(message, options, function(err, ret){
            if (err) {
              err.status = 400;
              return next(err);
            }
            if(!ret) return next();
            var result = ret.xml;

            _format(result);

            req.body = result;
            next();
          });
        }else {
          req.body = data;
          next();
        }
      });
    });
  };
}

function extend(source, target){
  for(var k in target){
    source[k] = target[k];
  }
  return source;
}

function hasBody(req) {
  var encoding = 'transfer-encoding' in req.headers;
  var length = 'content-length' in req.headers && req.headers['content-length'] !== '0';
  return encoding || length;
}

function mime(req) {
  var str = req.headers['content-type'] || '';
  return str.split(';')[0];
}

function error(code, msg) {
  var err = new Error(msg || http.STATUS_CODES[code]);
  err.status = code;
  return err;
}
