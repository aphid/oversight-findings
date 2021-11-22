var https = require('https');
var http = require('http');
var method = http;
var san = require("sanitize-filename");
var fs = require('fs');
var crypto = require('crypto');
var moment = require("moment");
var axios = require('axios');
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
                let ip = req.socket.remoteAddress;
                let timestamp = new Date().toTimeString();
                inData.author = ip;
                inData.timestamp = timestamp;
                processOCR(inData);
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
    let md;


    var img = data.image.replace(/^data:image\/png;base64,/, "");

    fs.writeFileSync(out, img, 'base64');
    var meta = {
        "Title": "unburning " + data.unburnCode,
        "AppInfoApplication": "unburn",
        "AppInfoItemURI": `https://oversightmachin.es/unburn/d.html?id=${data.unburnCode}&`,

        "StereoMode": data.mode,
        "HistoryAction": "saved, created, saved, redacted, published, scraped, unburned, saved",
        "HistoryChanged": "/, /, /metadata",
        "Copyright": "Public Domain",
        "ImageRegionRoleIdentifier": "abstraction against deputization",
        "RecommendedExposureIndex": data.data.interval,
        "GradientBasedCorrRangeMaskDepthMin": data.data.low,
        "GradientBasedCorrRangeMaskDepthMax": data.data.high,
        "XMP-crd:WhiteBalance": "b7e",
        "GPSAltitude": 1312,
        "GPSAltitudeRef": 0,
        "GPSAreaInformation": "Baltimore, MD",
        "GPSLatitude": "39.2904",
        "GPSLongitude": "76.6122"
    };

    if (data.data.metadata) {
        let md = JSON.parse(data.data.metadata);
        meta["Description"] = md.title;
        meta["BaseURL"] = md.url;
        meta["MetadataDate"] = md.metadata["fileModificationDate/Time"];
    }
    let ex = await exif.write(out, meta, ['-overwrite_original', '-n']);
    console.log(ex);
    //addPage(inData.title, inData.page);*/
}


async function processOCR(inData) {
    console.log(inData.title, inData.root);
    //var ip = req.socket.remoteAddress;
    //var hash = crypto.createHash('md5').update(ip + new Date().toTimeString()).digest('hex');
    //DO IMAGE
    let reduced = [];
    if (inData.pageImg) {
        var out = outDir + "ocr/" + san(inData.title + "_" + inData.page + "_" + inData.mode + ".png");
        console.log(out);
        if (!fs.existsSync(out)) {
            var img = inData.pageImg.replace(/^data:image\/png;base64,/, "");
            fs.writeFileSync(out, img, 'base64');
            console.log("writing ", out);
            reduced = reduceWords(inData.words);
            console.log("reduced: ", reduced);
            let meta = {
                "DerivedFromRenditionClass": JSON.stringify(reduced)
            }
            let ex = await exif.write(out, meta, ['-overwrite_original', '-n']);
            addPage(inData.title, inData.page);
        }
    }
    if (inData.words) {
        console.log("WORDS");
        var out = outDir + "ocr/" + san(inData.title + "_" + inData.page + "_" + inData.mode + ".json");
        if (!fs.existsSync(out)) {

            fs.writeFileSync(out, JSON.stringify({
                "author": inData.author,
                "timestamp": inData.timestamp,
                "page": inData.page,
                "root": this.root,
                "title": inData.title,
                "mode": inData.mode,
                "reduced": reduced,
                "words": inData.words

            }, undefined, 2), "utf8");
        }
    } else {
        console.log("no words");
    }
    await checkForCompletePDF(inData);
}

function reduceWords(input) {
    let reduced = [];
    for (let w of input) {
        let p = w.potentials;
        console.log(p.length, "potentials");
        if (p.length == 1) {
            if (p[0] !== undefined) {
                reduced.push(p[0].word);
            }
        } else if (p.length > 1) {
            let arr = [];
            console.log(p);
            for (let pot of p) {
                console.log(pot.word);
                arr.push(pot.word)
            }
            console.log(arr);
            reduced.push(arr);
        }
    }
    return reduced;
}

async function checkForCompletePDF(inData) {
    let pdf = await pdfFromID(inData.title);
    let pageCount = pdf.pageCount;
    for (let i = 0; i < pageCount; i++) {
        var out = outDir + "ocr/" + san(inData.title + "_" + i + "_" + inData.mode + ".png");
        if (!fs.existsSync(out)) {
            console.log("missing", out);
            return false;
        } else {
            console.log("so far so good", out);
        }
    }
    //if we got this far, make a PDF;
}

async function pdfFromID(title) {
    let url = "https://oversightmachin.es/oversee/media/text/" + title + ".pdf.json";
    let data = await axios(url);
    return data.data;

    console.log("no data", url);
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
