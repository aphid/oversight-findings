let fs = require("fs");


let data = fs.readFileSync("data.json");

data = JSON.parse(data);

shuffle(data.hearings);

let docs = ["100720_0245_attach", "180509_0930_HASPEL_UNCLASS-QFR_RESPONSE_15MAY18_UPDATED", "180509_0930_q-ghaspel-050918", "170112_1000_pre-hearing-011217", "171101_0930_Exhibits_used_by_Chairman_Burr_during_the_2017-11-01_hearing", "170112_1000_pre-hearing-b-011217", "170112_1000_questionnaire-011217","171101_0930_Exhibits_used_by_Vice_Chairman_Warner_during_the_2017-11-01_hearing"];
let indices = [];
for (let [hi,h] of data.hearings.entries()){
   for (let w of h.witnesses){
      for (let p of w.pdfs){
	//console.log(hi, p.shortName);
	if (p.shortName === "170112_1000_questionnaire-011217"){
	  //process.exit();
	}
        if (docs.includes(p.shortName) && !indices.includes(hi)){
	   console.log("yes");
           indices.push(hi);
	}
      }
   }
}

console.log(indices);

//indices = [60,10,23,11,24,25,4,5];


let reshift = function(arr,index){
   arr.unshift(arr.splice(index, 1)[0]);
}

for (let i of indices){
   reshift(data.hearings,i);
}
fs.writeFileSync("/var/www/oversightmachin.es/html/ocr/mixedup.json", JSON.stringify(data,undefined,2));



function shuffle(array) {
  let currentIndex = array.length;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
}



