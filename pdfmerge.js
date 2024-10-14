let fs = require('fs');
let puppeteer = require('puppeteer');
const PDFMerge = require('pdf-merge');
let exif = require("exiftool-vendored").exiftool;
let slashDir = "/mnt/oversee/findings/slash/";
let printDir = slashDir + "print/";
let queue = [];
for (let i of fs.readdirSync("/mnt/oversee/findings/slash/")){
   console.log(i);
   if (i.includes(".pdf") && !i.includes(".json") && !fs.existsSync(printDir + i)){
      console.log("processing " + i);
      queue.push(slashDir + i);
   }

}
console.log("----------------------------------------------------------");
console.log(queue);
//process.exit();

//let title = "/mnt/oversee/findings/slash/171101_0930_Exhibits_used_by_Chairman_Burr_during_the_2017-11-01_hearing_tesseract_2.1.1.pdf";
let metaFontSize;
let dothething = async function(){
    for (let title of queue){
      metaFontSize = 18;
      await mergePDFs(title, metaFontSize);
    }
}

let mergePDFs = async function(pdft, fontsize){
    //page length at sizes.  9: 5243  10.5?: 2966
    console.log("starting ", pdft, " at ", fontsize);
    let theJSON = fs.readFileSync(`${pdft}.json`, "utf8").replace(/\\/g, "");
    let browser = await puppeteer.launch({timeout: 0});
    let page = await browser.newPage();
    page.on('console', async (msg) => {
        const msgArgs = msg.args();
        for (let i = 0; i < msgArgs.length; ++i) {
            console.log(await msgArgs[i].jsonValue());
        }
    });
    console.log(fontsize);
    var fsz = fontsize;
    let url = "https://oversightmachin.es/ocr/metadata_template.html";
    await page.goto(url, { waitUntil: 'networkidle0' });
    let ev = await page.evaluate((theJSON, fsz) => {
        //console.log(document.body.innerHTML);
        let dom = document.querySelector('#metadata');
        //console.log(dom);
	dom.style.fontSize = fsz + "pt";
        dom.innerHTML = theJSON;
	console.log(dom.clientHeight);
    }, theJSON, fsz);
    let tmpfile = "temp_merged.pdf";
    let pdf = await page.pdf({
	    path: tmpfile,
	    format: "Letter",
	    margin: {top: "0.75in", right: "0.75in", bottom: "0.75in", left: "0.75in"},
	    printBackground: true
    });
    let tmpmeta = await exif.read(tmpfile);
    console.log(tmpmeta.PageCount);
    if (tmpmeta.PageCount > 25 && metaFontSize > 8){
       metaFontSize = metaFontSize - 0.5;
       console.log("new size " + metaFontSize);
       await browser.close();
       return mergePDFs(pdft, metaFontSize);
    }

    let pdfs = [pdft, "./temp_merged.pdf"];
    let printpdf = pdft.replace("/slash/", "/slash/print/");
    await PDFMerge(pdfs, {output: printpdf});
    console.log("...and SCENE");
    return Promise.resolve();
}

dothething();




