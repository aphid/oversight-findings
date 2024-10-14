var https = require('https');
var http = require('http');
var method = http;
var pdfkit = require('pdfkit');
var puppeteer = require('puppeteer');
var PDFMerge = require('pdf-merge');
var san = require("sanitize-filename");
var fs = require('fs');
var dayjs = require("dayjs");
var axios = require('axios');
var exif = require("exiftool-vendored").exiftool;
var sizeOf = require("image-size");
var settings = fs.readFileSync("settings.json");
settings = JSON.parse(settings);
console.log(settings);
var outDir = settings.outDir;
var hearingsFile = settings.hearingsFile;
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
    console.log(dayjs().format());
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
                let timestamp = dayjs().format("YYYY:MM:DD HH:mm:s.SSZ");
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

async function mergePDF(title){



}

async function writeLog(msg) {
    let log = fs.readFileSync("log.txt", "utf8");
    log = log + "\n" + new Date().toString() + ": " + msg;
    fs.writeFileSync("log.txt", log, "utf8");
};

async function processOCR(inData) {

    console.log(inData.title, inData.root);
    //var ip = req.socket.remoteAddress;
    //var hash = crypto.createHash('md5').update(ip + new Date().toTimeString()).digest('hex');
    //DO IMAGE
    let reduced = [];
    let meta = {};
    let hearing = await hearingFromID(inData.title);
    //console.log(inData);
    //console.log(hearing);
    let witness = hearing.witness;
    hearing = hearing.hearing;
    writeLog("OCR for " + hearing.shortName + " " + inData.exh);
    let subpath = "ocr/";
    if (inData.exh === "slash" || inData.exhibition === "slash") {
        subpath = "slash/";
    }
    let sanTitle = san(inData.title);
    let pageNum = (inData.page + "").padStart(3, "0");
    let outpattern = outDir + `${subpath}${sanTitle}_${pageNum}_${inData.mode}`;
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
        let img = inData.pageImg.replace(/^data:image\/png;base64,/, "");
        let testimg = `/mnt/oversee/overSSCIght/media/text/${sanTitle}/${sanTitle}_${pageNum}.jpg`;
        //console.log(sizeOf(testimg));
        //todo test image dimensions against existing page	
        console.log(out);
        meta.author = inData.author;
        //meta.timestamp = inData.timestamp;
        meta.ownerName = `${witness.title || ""} ${witness.firstName} ${witness.lastName}`;
        if (witness.org) {
            meta.ownerName += ", " + witness.org;
        }

        if (!fs.existsSync(out)) {
            fs.writeFileSync(out, img, 'base64');
            console.log("writing ", out);
            reduced = reduceWords(inData.words);
            console.log("reduced: ", reduced);
            console.log(inData.timestamp);
            writeLog("wrote image: " + out);
            meta.DerivedFromRenditionClass = JSON.stringify(reduced);

        }
        if (location) {
            meta["exif:GPSLatitude"] = location[0];
            meta["exif:GPSLatitudeRef"] = "N";
            meta["exif:GPSLongitude"] = location[1];
            meta["exif:GPSLongitudeRef"] = "W";

            //meta["GPSPosition"] = `${location[0]} ${location[1]}`;
        }
        await exif.write(out, meta, ['-overwrite_original', '-n']);
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
            writeLog("wrote json: " + out);
        }
    } else {
        console.log("no words");
    }
    console.log("checking for full pdf");
    console.log("finished with ocr");
    await doTheThing();
    return Promise.resolve();
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
    data = await axios(url);
    if (data) {
        console.log("ok");
        //console.log(data.data);
        return Promise.resolve(data.data);
    } else {
        console.log("no data", url);
        return Promise.reject();
    }
}

async function hearingFromID(title) {
    let data = JSON.parse(fs.readFileSync("/var/www/oversightmachin.es/html/ocr/mixedup.json"));
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
    console.log("no data");
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
let port = 3000;
server.listen(port);
console.log('Listening at http://' + ':' + port);

//console.log(pdfFromID("180307_0930_os-bfarrell-030718"));



let full, hDocs;
let docspath = "/var/www/oversightmachin.es/html/ocr/";
let slashPath = "/mnt/oversee/findings/slash/";
let ocrPath = "/mnt/oversee/findings/ocr/"

hDocs = [];
let getData = async function () {
    let f = fs.readFileSync("/var/www/oversightmachin.es/html/ocr/mixedup.json");
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
        await h.checkPDF();
        console.log("checking images");
        await h.checkImages();
        console.log("checking ocr");
    }
    let ocrData = [...hDocs];
    let slashData = [...hDocs];
    for (let h of ocrData) {
        await h.checkOCR(ocrPath);
    }
    console.log("ocrdata", ocrData[ocrData.length - 1].lastPage);
    fs.writeFileSync(`${docspath}ocrdata.json`, JSON.stringify(ocrData, undefined, 2));
    for (let h of slashData) {
        await h.checkOCR(slashPath);
        await h.checkForCompletePDF("slash");
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

Doc.prototype.checkOCR = async function (findingsPath) {
    //console.log(this);
    this.completedModes = [];
    this.lastPage = {};
    for (let m of this.modes) {
        this.lastPage[m] = 0;
        console.log("checking for", this.shortName, m);
        let fn = `${findingsPath}${this.shortName}_${m}.pdf`
        if (fs.existsSync(fn) && !this.completedModes.includes(m)) {
            console.log("found", fn);
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
        if (!this.lastPage[m]) {
            this.lastPage[m] = 0;
        }
        if (this.lastPage[m] === this.pages - 1 && !this.completedModes.includes(m)) {

            this.completedModes.push(m);
            console.log("complete!", m);
        }
        console.log("last page ", this.lastPage[m]);
    }
    //console.log(this.lastPage);

    return Promise.resolve();
}

let doTheThing = async function () {
    await wait(50);
    console.log("getting data");
    await getData();
    console.log("making docs");
    await makeHearDocs();
    console.log("checking docs");
    await checkHearDocs();
    console.log(hDocs.length, "docs");

};

if (process.argv.indexOf('--dothething') > -1) {
    doTheThing();

}


Doc.prototype.checkForCompletePDF = async function (exh, mode) {
    console.log("checking PDF");

    //these are what's in hdocs;
    let outDir = "/mnt/oversee/findings/"
    let subpath = "ocr/";
    if (exh === "slash") {
        subpath = "slash/";
    }

    let pdfout = outDir + subpath + this.shortName + "_" + mode + ".pdf";
    if (fs.existsSync(pdfout)) {
        this.rendition = true;
        console.log("it's complete!");
        return Promise.resolve("complete");
    } else {
        console.log("rendered PDF is missing");
    }

    let complete = true;
    for (let m of this.completedModes) {
        console.log("trying", m);
        let pages = [];
        for (let i = 0; i < this.pages; i++) {
            let img = `${outDir}${subpath}${this.shortName}_${(i + "").padStart(3, "0")}_${m}.png`;
            if (!fs.existsSync(img)) {
                console.log("expected", img);
                complete = false;
            } else {
                pages.push(img);
            }
        }
        console.log("complete?", complete);
        if (!complete) {
            this.rendition = false;
            return Promise.resolve("incomplete");
        }
        console.log("rendering PDF from complete imageset");
        await this.renderPDF(pages, m, subpath)
    }

}

Doc.prototype.renderPDF = async function (pages, mode, subpath) {
    let pdfout = outDir + subpath + this.shortName + "_" + mode + ".pdf";
    let thedoc = this;
    let reduced = [];
    if (fs.existsSync(pdfout) && fs.existsSync(pdfout + ".json")) {
        return Promise.resolve();
    }
    let doc = new pdfkit({
        autoFirstPage: false
    });
    let stream = fs.createWriteStream(pdfout);
    doc.pipe(stream);
    console.log(pages);
    let meta = await exif.read(pages[0]);
    for (let page of pages) {
        console.log("adding page", page);
        doc.addPage({
            size: 'letter'
        });
        //doc.rect(0, 0, doc.page.width, doc.page.height).fill('#16161d'); //eigengrau background
        doc.image(page, 0, 0, {
            fit: [doc.page.width, doc.page.height]
        });
        let imgmeta = await exif.read(page);
        //console.log(imgmeta);
	//process.exit();
        if (imgmeta.DerivedFrom.RenditionClass) {
            reduced.push.apply(reduced, JSON.parse(imgmeta.DerivedFrom.RenditionClass));
        }
        let metadata = JSON.parse(fs.readFileSync(page.replace("png", "json")));
        if (metadata) {
	     
            reduced.push.apply(reduced, metadata.reduced);
        }

    }
    console.log("metaaaa");
    console.log("metaaaa");
    let pmeta = {};
    pmeta.Author = meta.Author;
    pmeta.Owner = meta.OwnerName;
    pmeta.Creator = "operational character rendition 0.1.2409";
    //pmeta.timestamp = meta.timestamp;
    pmeta.DerivedFromRenditionClass = JSON.stringify(reduced);
    if (subpath.includes("slash")) {
        pmeta.GPSPosition = "37.753330866446966, -122.39040924766917";
    } else {
        pmeta.GPSPosition = meta["GPSPosition"];
    }
    //pmeta.GPSLatitudeRef = meta["GPSLatitudeRef"];
    //pmeta.GPSLongitude = meta["GPSLongitude"];
    //pmeta.GPSLongitudeRef = meta["GPSLongitudeRef"];
    //pdfout = pdfout.replace(".pdf", "_m.pdf");
    doc.end();
    //console.log(pmeta);
    stream.on('finish', async function () {
        console.log("finishing pdf, writing file");
        await exif.write(pdfout, pmeta, ['-overwrite_original', '-n']);
        console.log("writing metadata");
        let jsonout = pdfout.replace(".pdf", ".pdf.json");
        console.log("checking", jsonout);
        let cdoc = structuredClone(thedoc);
        delete cdoc.pageImages;
        delete cdoc.localPath;
        delete cdoc.hearing.shortname;
        delete cdoc.shortName;
        delete cdoc.hearing.shorttime;
        delete cdoc.hearing.shortdate;
        if (!fs.existsSync(jsonout)) {
	    console.log("writing json");
            fs.writeFileSync(jsonout, JSON.stringify({ document: cdoc, findings: pmeta }, undefined, 2));
        }
        console.log("finished with pdf");
        return Promise.resolve();
    });

}


