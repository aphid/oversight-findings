var https = require('https');
var san = require("sanitize-filename");
var fs = require('fs');
var crypto = require('crypto');
var privKey = fs.readFileSync( "/etc/letsencrypt/live/illegible.us/privkey.pem");
var cert = fs.readFileSync("/etc/letsencrypt/live/illegible.us/cert.pem");
var outDir = "/var/www/oversightmachin.es/html/findings/";
var moment = require("moment");
var hearingsFile = "/var/www/oversightmachin.es/html/oversee/data/data.json";
var hearings = JSON.parse(fs.readFileSync(hearingsFile));


var addPage = function(title,page){
   for (let h of hearings.hearings){
       for (let w of h.witnesses){
           for (let p of w.pdfs){
                if (p.title === title){
                    if (!h.ocrPages){
		        p.ocrPages = [];
		    }
                    p.ocrPages.push(page);
		}
	   }
       }
   }
   fs.writeFileSync(hearingsFile,JSON.stringify(hearings,undefined,2));
};


var server = https.createServer({ key: privKey, cert: cert}, function(req, res) {
    console.log(moment().format());
    console.dir(req.param);

	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Request-Method', '*');
	res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method == 'POST') {
        console.log("POST");
        var body = '';
        req.on('data', function (data) {
            body += data.toString();
        });
        req.on('end', function () {
            var inData = JSON.parse(body);
	    if (inData.timestamp1){
               processSpu(inData);
            } else {
            console.log(inData.title, inData.root);
            var ip = req.connection.remoteAddress;
            var hash = crypto.createHash('md5').update(ip + new Date().toTimeString()).digest('hex');
	 
            if (inData.pageImg){
            var out = outDir + san(inData.title + "_" + inData.page +  ".png");
            console.log(out);
            var img = inData.pageImg.replace(/^data:image\/png;base64,/, "");
            fs.writeFileSync(out, img, 'base64');
            addPage(inData.title,inData.page);
            } else if (inData.words){
            var out = outDir + san(inData.title + "_" + inData.page + ".json");
            fs.writeFileSync(out,JSON.stringify(inData,undefined,2),"utf8");
	    }
        }});
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('post received');
    }
    else
    {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('what');
    }

});

function processSpu(data){
  var out = outDir + san(data.page + "_" + data.timestamp1 + "_" + data.timestamp2 + ".png");
  console.log("writing", out);
  var img = data.pageImg.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(out, img, 'base64');
  var send = [];
  var datafile = (outDir + data.page + ".json");
  if (fs.existsSync(datafile)){
     send = JSON.parse(fs.readFileSync(datafile));
  }

  send.push({ timestamp1: parseFloat(data.timestamp1), timestamp2: parseFloat(data.timestamp2), measure: parseFloat(data.measure), threshold: data.threshold});
	  console.log(send);
  fs.writeFileSync(datafile, JSON.stringify(send));
  
}
port = 3000;
server.listen(port);
console.log('Listening at http://' + ':' + port);
