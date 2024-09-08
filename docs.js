let full, docs, hDocs;
let fs = require("fs");
let docspath = "/var/www/oversightmachin.es/html/ocr/";
hDocs = [];
let getData = async function () {
   let f = fs.readFileSync("data.json");
   full = JSON.parse(f);
   let d = fs.readFileSync("docs.json");
   docs = JSON.parse(d)
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


Doc.prototype.checkForCompletePDF = async function (){
   let pdf = this
   let outDir = "/mnt/oversee/findings/slash/"
    //console.log(pdf);
    let pageCount = pdf.metadata.pdfinfo.pages;
    let pages = [];
    let reduced = [];
    let sofar = "none";
    for (let m of this.mode){
    for (let i = 0; i < pageCount; i++) {
        let out = outDir + subpath + san(this.shortName + "_" + (i + "").padStart(3, "0") + "_" + m + ".png");
        pages.push(out);
        console.log("testing", out);
        if (!fs.existsSync(out)) {
            let theobj = {sofar: sofar}
            if (i > 0) {
                theobj.sofar = "incomplete";
                pdf.lastPage = i - 1;
            }

            return Promise.resolve(theobj);
        } else {
            console.log("so far so good", out);

        }
      }
    }
    sofar = "full";
    let pdfout = outDir + subpath + san(inData.title + "_" + inData.mode + ".pdf");
    if (fs.existsSync(pdfout)) {
        console.log("PDF exists");
        return Promise.resolve({sofar: sofar});
    }


}

let makeHearDocs = async function () {
   for (let hearing of full.hearings) {
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
   return Promise.resolve();
}

let checkHearDocs = async function () {
   for (let h of hDocs) {
      let cp = await h.checkPDF();
      let ci = await h.checkImages();
      let co = await h.checkOCR();
      let cc = await.h.checkForCompletePDF();
   }
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
      if (!fs.existsSync(ps)) {
         this.imagesChecked = false;
         return Promise.reject();
      }
   }
   this.imagesChecked = true;
   return Promise.resolve();
}

Doc.prototype.checkOCR = async function () {

   let findingsUrl = "https://oversightmachin.es/findings/slash/";
   let findingsPath = "/mnt/oversee/findings/slash/";
   for (let m of this.modes) {
      console.log("checking for", this.shortName, m);
      let fn = `${findingsPath}${this.shortName}_${m}.pdf`
      if (fs.existsSync(fn)) {
         this.completedModes.push(m);
      }
   }
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
   fs.writeFileSync(`${docspath}hdocs.json`, JSON.stringify(hDocs, undefined, 2));
};

doTheThing();

