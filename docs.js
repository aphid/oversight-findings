let full, docs, hDocs;
let fs = require("fs");
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
      let co = await h.checkOCR(slashPath, "hdocs.json");
      co = await h.checkOCR(ocrPath, "ocrdocs.json")
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
   console.log(this);
   this.lastPage = {};
   this.completedModes = [];
   if (this.lastPage) {
      delete this.lastPage;
   }
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
      console.log("last page ", this.lastPage[m]);
   }
   console.log(this.lastPage);
   fs.writeFileSync(`${docspath}${fn}.json`, JSON.stringify(hDocs, undefined, 2));
   let pages = 0;
   for (let h of hDocs) {
      pages += h.pages;
   }
   console.log(pages, " pages");
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

doTheThing();

