var parseString = require('xml2js').parseString;
var WXBizMsgCrypt = require('wechat-crypto');
var http = require('http');
var regexp = /^(text\/xml|application\/([\w!#\$%&\*`\-\.\^~]+\+)?xml)$/i;

exports = module.exports = bodyParser;

function bodyParser(options) {
  var defaultOptions = {
    async: true,
    explicitArray: true,
    normalize: true,
    normalizeTags: true,
    trim: true
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

    if (req._body) {
      return next();
    }

    if (!hasBody(req) || !regexp.test(mime(req))) {
      return next();
    }

    req.body = req.body || {};

    req._body = true;

    req.setEncoding('utf-8');

    req.on('data', function(chunk) {
      data += chunk;
    });
    req.on('end', function() {
      if (!data.trim()) {
        return next(error(411));
      }

      parseString(data, parserOptions, function(err, xml) {
        if (err) {
          err.status = 400;
          return next(err);
        }

        req.rawBody = data;

        var data = Object.keys(xml.xml).reduce(function(memo, k){
          memo[_s.underscored(k)] = obj.xml[k][0];
          return memo;
        }, {});

        if(crypter && data.encrypt){
          var message = crypter.decrypt(data.encrypt).message;

          parseString(message, options, function(err, ret){
            if (err) {
              err.status = 400;
              return next(err);
            }

            var result = Object.keys(ret.xml).reduce(function(memo, k){
              memo[_s.underscored(k)] = ret.xml[k][0];
              return memo;
            }, {});

            req.body = result;
            next();
          });
        }else {
          req.body = data;
          next();
        }
      });
    });
  }
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
