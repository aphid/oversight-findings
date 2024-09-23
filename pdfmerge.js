let fs = require('fs');
let puppeteer = require('puppeteer');
const PDFMerge = require('pdf-merge');


let dothething = async function(){
    console.log("lets goooo");
    let theJSON = fs.readFileSync("/mnt/oversee/findings/slash/170112_1000_questionnaire-011217_tesseract_2.1.1.pdf.json", "utf8").replace(/\\/g, "");
    let browser = await puppeteer.launch();
    let page = await browser.newPage();
    page.on('console', async (msg) => {
        const msgArgs = msg.args();
        for (let i = 0; i < msgArgs.length; ++i) {
            console.log(await msgArgs[i].jsonValue());
        }
    });
    let url = "https://oversightmachin.es/ocr/metadata_template.html";
    await page.goto(url, { waitUntil: 'networkidle0' });
    let ev = await page.evaluate((theJSON) => {
        //console.log(document.body.innerHTML);
        let dom = document.querySelector('div');
        //console.log(dom);
        dom.innerHTML = theJSON;
    }, theJSON);
    let pdf = await page.pdf({
	    path: "temp_merged.pdf",
	    format: "Letter",
	    margin: {top: "0.75in", right: "0.75in", bottom: "0.75in", left: "0.75in"},
	    printBackground: true
    });
    let pdfs = ["/mnt/oversee/findings/slash/170112_1000_questionnaire-011217_tesseract_2.1.1.pdf", "./temp_merged.pdf"];
    PDFMerge(pdfs, {output: "/mnt/oversee/findings/slash/print/170112_1000_questionnaire-011217_tesseract_2.1.1.pdf"});
}

dothething();





