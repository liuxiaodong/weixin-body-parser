# weixin-body-parser
微信消息解析中间件
####Install

```
	npm install weixin-body-parser --save
```

####Usage

```
	var wxBodyParser = require('weixin-body-parser');
	
	app.use(wxBodyParser({token:'token', encrypt_key:'encrypt_key',app_id:'app_id'}));
```
* If you use other bodyParser middleware, please use it after wxBodyParser.


####Example

`POST XML` :

```   
<xml>
  <AppId>12345678<AppId>
  <CreateTime>1413192605<CreateTime>
  <InfoType>component_verify_ticket<InfoType>
  <ComponentVerifyTicket>aaaaaaaaaaaaaaaaaaaaaaaaa</ComponentVerifyTicket>
</xml>
```

`req.body` :  

```
	{
		app_id: '12345678',
		create_time: '1413192605',
		info_type: 'component_verify_ticket',
		component_verify_ticket: 'aaaaaaaaaaaaaaaaaaaaaaaaa'
	}	
```
