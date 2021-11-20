var https = require('https');
var http = require('http');
var method = http;
var san = require("sanitize-filename");
var fs = require('fs');
var crypto = require('crypto');
var moment = require("moment");
var exif = require("exiftool-vendored").exiftool;
var settings = fs.readFileSync("settings.json");
settings = JSON.parse(settings);
console.log(settings);
var outDir = settings.outDir;
var hearingsFile = settings.hearingsFile;
var encrypt;
var serverOpts = {};
console.log(hearingsFile)
var hearings = JSON.parse(fs.readFileSync(hearingsFile));

var dirs = ["ocr", "spu", "unburn"];
for (let d of dirs) {
    let target = outDir + "/" + d;
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target);
    }
}


if (settings.privkey && settings.cert) {
    console.log("using https")
    encrypt = true;
    method = https;
    serverOpts.key = fs.readFileSync(settings.privKey);
    serverOpts.cert = fs.readFileSync(settings.cert);
}



var addPage = function(title, page) {
    for (let h of hearings.hearings) {
        for (let w of h.witnesses) {
            for (let p of w.pdfs) {
                if (p.title === title) {
                    if (!h.ocrPages) {
                        p.ocrPages = [];
                    }
                    p.ocrPages.push(page);
                }
            }
        }
    }
    fs.writeFileSync(hearingsFile, JSON.stringify(hearings, undefined, 2));
};


var server = method.createServer(serverOpts, function(req, res) {
    console.log(moment().format());
    console.dir(req.param);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Request-Method', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method == 'POST') {
        console.log("POST");
        var body = '';
        req.on('data', function(data) {
            body += data.toString();
        });
        req.on('end', function() {
            console.log(req.headers.referer);
            if (req.headers.referer) {

            }
            //need to determine which machine it is and pass it off to a handler

            var inData = JSON.parse(body);
            if (inData.machine === "spu") {
                processSpu(inData);
            } else if (inData.machine === "unburn") {
                //"machine":"unburn","mode":"d","time":32.64,"data":{"interval":102,"low":53,"high":151},"image":"
                processUnburn(inData);
            } else {
                console.log(inData.title, inData.root);
                var ip = req.socket.remoteAddress;
                var hash = crypto.createHash('md5').update(ip + new Date().toTimeString()).digest('hex');

                if (inData.pageImg) {
                    var out = outDir + "ocr/" + san(inData.title + "_" + inData.page + ".png");
                    console.log(out);
                    var img = inData.pageImg.replace(/^data:image\/png;base64,/, "");
                    fs.writeFileSync(out, img, 'base64');
                    addPage(inData.title, inData.page);
                } else if (inData.words) {
                    var out = outDir + "ocr/" + san(inData.title + "_" + inData.page + ".json");
                    fs.writeFileSync(out, JSON.stringify(inData, undefined, 2), "utf8");
                }
            }
        });
        res.writeHead(200, {
            'Content-Type': 'text/html'
        });
        res.end('post received');
    } else {
        res.writeHead(200, {
            'Content-Type': 'text/html'
        });
        res.end('what');
    }

});

async function processUnburn(data) {
    //"machine":"unburn","mode":"d","time":32.64,"data":{"interval":102,"low":53,"high":151},"image":"
    let id = `${data.unburnCode}_${data.mode}_${data.data.interval}_${data.data.low}_${data.data.high}_${data.time}`;
    var out = `${outDir}unburn/${id}.png`;
    console.log(id);
    console.log(out);
    let md = JSON.parse(data.data.metadata);

    var img = data.image.replace(/^data:image\/png;base64,/, "");

    fs.writeFileSync(out, img, 'base64');
    var meta = {
        "Title": "unburning " + data.unburnCode,
        "Description": md.title,
        "BaseURL": md.url,
        "MetadataDate": md.metadata["fileModificationDate/Time"],
        "AppInfoApplication": "unburn",
        "AppInfoItemURI": `https://oversightmachin.es/unburn/d.html?id=${data.unburnCode}&`,

        "StereoMode": data.mode,
        "HistoryAction": "saved, created, saved, redacted, published, scraped, unburned, saved",
        "HistoryChanged": "/, /, /metadata",
        "Copyright": "Public Domain",
        "ImageRegionRoleIdentifier": "abstraction against deputization",
        "RecommendedExposureIndex": data.data.interval,
        "Location": "Baltimore, MD",
        "GradientBasedCorrRangeMaskDepthMin": data.data.low,
        "GradientBasedCorrRangeMaskDepthMax": data.data.high
    };
    let ex = await exif.write(out, meta, ['-overwrite_original']);
    exif.end();
    console.log(ex);
    //addPage(inData.title, inData.page);*/
}

function processSpu(data) {
    for (let t of data.timestamps) {
        t = parseFloat(t);
    }
    console.log(data);
    var out = outDir + "spu/" + san(data.page + "_" + data.timestamps[0] + "_" + data.timestamps[1] + ".png");
    console.log("writing", out);
    var img = data.pageImg.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(out, img, 'base64');
    var send = [];
    var datafile = (outDir + "spu/" + data.page + ".json");
    if (fs.existsSync(datafile)) {
        send = JSON.parse(fs.readFileSync(datafile));
    }

    send.push({
        timestamps: data.timestamps,
        measure: parseFloat(data.measure),
        threshold: data.threshold
    });
    console.log(send);
    fs.writeFileSync(datafile, JSON.stringify(send));

}
port = 3000;
server.listen(port);
console.log('Listening at http://' + ':' + port);