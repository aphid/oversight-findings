var https = require('https');
var http = require('http');
var method = http;
var pdfkit = require('pdfkit')
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

var dirs = ["ocr", "spu", "unburn", "slash"];
for (let d of dirs) {
    let target = outDir + "/" + d + "/";
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target);
    }
}

if (settings.privKey && settings.cert) {
    console.log("using https")
    encrypt = true;
    method = https;
    serverOpts.key = fs.readFileSync(settings.privKey);
    serverOpts.cert = fs.readFileSync(settings.cert);
}



var addPage = function (title, page) {
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


var server = method.createServer(serverOpts, async function (req, res) {
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
        req.on('end', async function () {
            console.log(req.headers.referer);
            if (req.headers.referer) {
                console.log("referer", req.headers.referer);
            }
            //need to determine which machine it is and pass it off to a handler

            var inData;
            try { inData = JSON.parse(body); }
            catch (e) {
                console.log(body);
                throw (e);
            }

            if (inData.machine === "spu") {
                processSpu(inData);
            } else if (inData.machine === "unburn") {
                //"machine":"unburn","mode":"d","time":32.64,"data":{"interval":102,"low":53,"high":151},"image":"
                processUnburn(inData);
            } else {
                //it's ocr
                console.log("OCR");
                let ip = req.socket.remoteAddress;
                let timestamp = moment().format("YYYY:MM:DD HH:mm:s.SSZ");
                inData.author = ip;
                inData.DateTimeDigitized = timestamp;
                await processOCR(inData);
            }
            res.writeHead(200, {
                'Content-Type': 'text/html'
            });
            res.end('{"status": "success"}');
        });

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
    if (!fs.existsSync(`${outDir}/unburn/${data.unburnCode}`)) {
        fs.mkdirSync(`${outDir}/unburn/${data.unburnCode}`);
    }
    var out = `${outDir}unburn/${data.unburnCode}/${id}.png`;
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
        "GPSAreaInformation": "Winchester, VA",
        "GPSLatitude": "39.141014",
        "GPSLongitude": "-78.1197433"
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
    let meta = {};
    let hearing = await hearingFromID(inData.title);
    //console.log(inData);
    console.log(hearing);
    let witness = hearing.witness;
    hearing = hearing.hearing;
    let subpath = "ocr/";
    if (inData.exh === "slash" || inData.exhibition === "slash") {
        subpath = "slash/";
    }
    let outpattern = outDir + `${subpath}${san(inData.title)}_${(inData.page + "").padStart(3, "0")}_${inData.mode}`;
    console.log(subpath);
    let location;
    if (hearing.location.includes("Hart")) {
        location = [38.893056, -77.004167];
    } else if (hearing.location.includes("Russell")) {
        location = [38.892778, -77.006944];
    } else if (hearing.location.includes("Dirksen")) {
        location = [38.893056, -77.005278];
    }

    if (inData.pageImg) {
        console.log("IMAGE");
        let out = outpattern + ".png";
        console.log(out);
        meta.author = inData.author;
        //meta.timestamp = inData.timestamp;
        meta.ownerName = `${witness.title || ""} ${witness.firstName} ${witness.lastName}`;
        if (witness.org) {
            meta.ownerName += ", " + witness.org;
        }

        if (!fs.existsSync(out)) {
            var img = inData.pageImg.replace(/^data:image\/png;base64,/, "");
            fs.writeFileSync(out, img, 'base64');
            console.log("writing ", out);
            reduced = reduceWords(inData.words);
            console.log("reduced: ", reduced);
            console.log(inData.timestamp);

            meta.DerivedFromRenditionClass = JSON.stringify(reduced);

        }
        if (location) {
            meta["exif:GPSLatitude"] = location[0];
            meta["exif:GPSLatitudeRef"] = "N";
            meta["exif:GPSLongitude"] = location[1];
            meta["exif:GPSLongitudeRef"] = "W";

            //meta["GPSPosition"] = `${location[0]} ${location[1]}`;
        }
        let ex = await exif.write(out, meta, ['-overwrite_original', '-n']);
        //console.log(ex);
        addPage(inData.title, inData.page);
    }

    if (inData.words) {
        console.log("WORDS");
        let out = outpattern + ".json";
        if (!fs.existsSync(out)) {

            fs.writeFileSync(out, JSON.stringify({
                "author": inData.author,
                "timestamp": inData.timestamp,
                "HistoryChanged": "/, /, /metadata",
                "Copyright": "Public Domain",
                "page": inData.page,
                "root": this.root,
                "DerivedFrom": inData.title,

                "mode": inData.mode,
                "reduced": reduced,
                "words": inData.words

            }, undefined, 2), "utf8");
        }
    } else {
        console.log("no words");
    }
    console.log("checking for full pdf");
    let pdfprogress = await checkForCompletePDF(inData, meta, subpath);
    console.log(pdfprogress);
    if (pdfprogress && pdfprogress.lastPage){
       inData.lastPage = pdfprogress.lastPage;
    }
    console.log("finished");
    await doTheThing();
    return Promise.resolve();
}

let updatehDocs = async function (indata) {
    console.log("updating hdocs");
    let fn;
    if (indata.exhibition === "slash" || indata.exh === "slash") {
        fn = "/var/www/oversightmachin.es/html/ocr/hdocs.json";

    } else {
        fn = "/var/www/oversightmachin.es/html/ocr/ocrdocs.json";

    }
    let data = fs.readFileSync(fn);
    data = JSON.parse(data);
    for (let d of data) {
        if (indata.title === d.shortName && !d.completedModes.includes(indata.mode)) {
            d.completedModes.push(indata.mode);
            //console.log(d);
        }
    }
    console.log("rewriting file");
    //fs.writeFileSync(fn, JSON.stringify(data, undefined, 2));
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
            //console.log(p);
            for (let pot of p) {
                //console.log(pot.word);
                arr.push(pot.word)
            }
            //console.log(arr);
            reduced.push(arr);
        }
    }
    return reduced;
}




async function checkForCompletePDF(inData, meta, subpath) {
    let pdf = await pdfFromID(inData.title);
    //console.log(pdf);
    let pageCount = pdf.pdfinfo.pages;
    let pages = [];
    let reduced = [];
    let sofar = "none";
    for (let i = 0; i < pageCount; i++) {
        let out = outDir + subpath + san(inData.title + "_" + (i + "").padStart(3, "0") + "_" + inData.mode + ".png");
        pages.push(out);
        console.log("testing", out);
        if (!fs.existsSync(out)) {
            let theobj = { sofar: sofar }
            if (i > 0) {
                theobj.sofar = "incomplete";
                theobj.lastPage = i - 1;
            }

            return Promise.resolve(theobj);
        } else {
            console.log("so far so good", out);
            let read = fs.readFileSync(out.replace("png", "json"));
            if (read) {
                read = JSON.parse(read);
                reduced.push.apply(reduced, read.reduced);
            }
        }
    }
    sofar = "full";
    let pdfout = outDir + subpath + san(inData.title + "_" + inData.mode + ".pdf");
    if (fs.existsSync(pdfout)) {
        console.log("PDF exists");
        return Promise.resolve({ sofar: sofar });
    }
    //make this a different function tho.
    console.log("time to make a PDF");
    let doc = new pdfkit({
        autoFirstPage: false
    });
    let stream = fs.createWriteStream(pdfout);
    doc.pipe(stream);

    for (let page of pages) {
	console.log("adding page");
        doc.addPage({
            size: 'letter'
        });
        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#16161d'); //eigengrau background
        doc.image(page, 0, 0, {
            fit: [doc.page.width, doc.page.height]
        });
        let imgmeta = await exif.read(page);
        //console.log(imgmeta);
        if (imgmeta.DerivedFrom.RenditionClass) {
            reduced.push.apply(reduced, JSON.parse(imgmeta.DerivedFrom.RenditionClass));
        }

    }
    console.log("metaaaa");
    pmeta = {};
    pmeta.author = meta.author;
    pmeta.owner = meta.owner;
    //pmeta.timestamp = meta.timestamp;
    pmeta.DerivedFromRenditionClass = JSON.stringify(reduced);
    pmeta.GPSLatitude = meta["exif:GPSLatitude"];
    pmeta.GPSLatitudeRef = meta["exif:GPSLatitudeRef"];
    pmeta.GPSLongitude = meta["exif:GPSLongitude"];
    pmeta.GPSLongitudeRef = meta["exif:GPSLongitudeRef"];
    //pdfout = pdfout.replace(".pdf", "_m.pdf");
    doc.end();
    //console.log(pmeta);
    stream.on('finish', async function () {
        try {
            let ex = await exif.write(pdfout, pmeta, ['-overwrite_original', '-n']);
	    console.log("writing metadata");
            return Promise.resolve({ sofar: sofar });

            //console.log(ex);
        } catch (e) {
            //console.log(e);
            throw (e);
        }
        //if we got this far, make a PDF;
    });
}

let wait = async function (ms) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, (ms));
    });
};


async function pdfFromID(title) {
    let hearing = await hearingFromID(title);
    hearing = hearing.hearing;
    let found = false;
    for (let w of hearing.witnesses) {
        for (let p of w.pdfs) {
            if (p.shortName === title) {
                found = p;
            }
        }
    }
    if (!found) {
        return false;
    }
    console.log("found ", found);
    let url = "https://oversightmachin.es/overSSCIght/media/text/" + found.localName + ".json";
    console.log("fetching", url);
    let data;
    try {
        data = await axios(url);
    } catch (e) {
        throw (e);
    }
    console.log("ok");
    //console.log(data.data);
    return Promise.resolve(data.data);
    console.log("no data", url);
}

async function hearingFromID(title) {
    /* let url = "https://oversightmachin.es/overSSCIght/data/240903_11.json";
    let data;
    try {
        data = await axios.get(url);
    } catch (e) {
        throw (e.response);
    }
    //console.log(data.data);
    console.log("hfi", title);
    console.log(data.data);
    */
    let data = JSON.parse(fs.readFileSync("data.json"));
    for (let h of data.hearings) {
        if (h.witnesses) {
            for (let w of h.witnesses) {
                if (w.pdfs) {
                    for (let p of w.pdfs) {
                        console.log(p.shortName);
                        if (p.shortName === title) {
                            console.log("found title");
                            return Promise.resolve({
                                hearing: h,
                                witness: w
                            });
                        }
                    }

                }
            }
        }
    }
    console.log("no data", url);
}



function processSpu(data) {
    for (let t of data.timestamps) {
        t = parseFloat(t);
    }
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

//console.log(pdfFromID("180307_0930_os-bfarrell-030718"));



let full, docs, hDocs;
let docspath = "/var/www/oversightmachin.es/html/ocr/";
let slashPath = "/mnt/oversee/findings/slash/";
let ocrPath = "/mnt/oversee/findings/ocr/"

hDocs = [];
let getData = async function () {
    let f = fs.readFileSync("data.json");
    full = JSON.parse(f);
}

let Doc = function (o, w, h) {
    this.hearing =
        this.localName = o.localName;
    this.localPath = o.localPath;
    if (o.metadata.pdfinfo) {
        this.pages = o.metadata.pdfinfo.pages;
    }
    this.pageImages = o.pageImages;
    this.shortName = o.shortName;
    this.modes = ["tesseract_2.1.1", "ocrad_0.25"];
    this.completedModes = [];
    this.witness = w;
    this.metadata = o.metadata;
    delete this.witness.pdfs;
    this.hearing = h;
    delete this.hearing.witnesses;
    delete this.hearing.video;
}


let makeHearDocs = async function () {
     hDocs = [];
     for (let hearing of full.hearings) {
        console.log(hearing.shortName);
        for (let witness of hearing.witnesses) {
            for (let pdf of witness.pdfs) {
                if (pdf.needsScan) {
                    hDocs.push(new Doc(pdf, witness, hearing));
                    console.log(pdf.localName);
                } else {
                    //console.log("doesn't need scan");
                }
            }
        }
    }
    console.log("done");
    return Promise.resolve();
}

let checkHearDocs = async function () {
    for (let h of hDocs) {
        console.log("checking pdf");
        let cp = await h.checkPDF();
        console.log("checking images");
        let ci = await h.checkImages();
        console.log("checking ocr");
    }
    let ocrData = [...hDocs];
    let slashData = [...hDocs];
    for (let h of ocrData){
        let co = await h.checkOCR(ocrPath, "ocrdocs.json");
    }
    console.log("ocrdata", ocrData[ocrData.length - 1].lastPage);
    fs.writeFileSync(`${docspath}ocrdata.json`, JSON.stringify(ocrData, undefined, 2));
    for (let h of slashData){
        co = await h.checkOCR(slashPath, "slashhdocs.json");
    }
    console.log("slashdata", slashData[slashData.length - 1].lastPage);
    //console.log(JSON.stringify(slashData, undefined, 2));
    fs.writeFileSync(`${docspath}slashdata.json`, JSON.stringify(slashData, undefined, 2));

      let pages = 0;
    for (let h of hDocs) {
        pages += h.pages;
    }
    console.log(pages, " pages");

    return Promise.resolve();
}

Doc.prototype.checkPDF = async function () {
    //console.log("checking for", this.localPath);
    this.pdfChecked = fs.existsSync(this.localPath);
    return Promise.resolve();
}

Doc.prototype.checkImages = async function () {
    for (let p of this.pageImages) {
        //https://oversightmachin.es/overSSCIght/media/text/180515_0930_q-revanina-051518/180515_0930_q-revanina-051518_000.jpg
        let ps = p.replace("https://oversightmachin.es", "/mnt/oversee");
        console.log(ps);
        if (!fs.existsSync(ps)) {
            this.imagesChecked = false;
            return Promise.reject();
        }
    }
    this.imagesChecked = true;
    return Promise.resolve();
}

Doc.prototype.checkOCR = async function (findingsPath, fn) {
    //console.log(this);
    this.completedModes = [];
    this.lastPage = {};
    for (let m of this.modes) {
        this.lastPage[m] = 0;
        console.log("checking for", this.shortName, m);
        let fn = `${findingsPath}${this.shortName}_${m}.pdf`
        if (fs.existsSync(fn)) {
            this.completedModes.push(m);
        }
        for (let i = 0; i < this.pages; i++) {
            let fn = `${findingsPath}${this.shortName}_${(i + "").padStart(3, "0")}_${m}.png`;
            console.log(fn);
            if (fs.existsSync(fn)) {
                console.log("found");
                this.lastPage[m] = i;
            } else {
                console.log("not found");
            }
        }
	if (!this.lastPage[m]){
	    this.lastPage[m] = 0;
	}
	if (this.lastPage[m] === this.pages - 1){

            this.completedModes.push(m);
	    console.log("complete!", m);
	}
        console.log("last page ", this.lastPage[m]);
    }
    //console.log(this.lastPage);

    return Promise.resolve();
}

let doTheThing = async function () {
    console.log("getting data");
    await getData();
    console.log("making docs");
    await makeHearDocs();
    console.log("checking docs");
    await checkHearDocs();
    console.log(hDocs.length, "docs");

};

if (process.argv.indexOf('--dothething') > -1 ){

    doTheThing();

}

