(function(root){
 const units=['صفر','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة'];
 function small(n){
 if(n<10)return units[n];
 const teens=['عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
 if(n<20)return teens[n-10];
 if(n<100){const tens=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'][Math.floor(n/10)];return (n%10?units[n%10]+' و':'')+tens;}
 const hundreds=['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];return hundreds[Math.floor(n/100)]+(n%100?' و'+small(n%100):'');
 }
 function integer(n){
 if(!n)return 'صفر';let result=[];
 for(const [scale,single,dual,plural] of [[1e12,'تريليون','تريليونان','تريليونات'],[1e9,'مليار','ملياران','مليارات'],[1e6,'مليون','مليونان','ملايين'],[1000,'ألف','ألفان','آلاف']]){
 const group=Math.floor(n/scale);if(group){result.push(group===1?single:group===2?dual:small(group)+' '+(group<=10?plural:single+'ا'));n%=scale;}
 }if(n)result.push(small(n));return result.join(' و');
 }
 function amountToArabicWords(amount){
 const cents=Math.round(Number(amount)*100);if(!Number.isFinite(Number(amount))||Number(amount)<0||!Number.isSafeInteger(cents))throw Error('Montant invalide');
 const whole=Math.floor(cents/100),fraction=cents%100;
 const main=whole===2?'درهمان':integer(whole)+' '+(whole<=1?'درهم':whole<=10?'دراهم':'درهما');
 return main+(fraction?' و'+(fraction===2?'سنتيمان':integer(fraction)+' '+(fraction===1?'سنتيم':fraction<=10?'سنتيمات':'سنتيما')):'');
 }
 function chequePrintMarkup({amount,beneficiary,date,template='cdm',offsetX=0,offsetY=0},escape){
 const formattedDate=String(date||'').split('-').reverse().join('/');
 if(template==='cdm'){
 const numeric='#'+Number(amount).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).replace(/[\u202f\u00a0]/g,' ').replace(',','.')+'#';
 return `<div class="cheque-word"><div class="cheque-word-content" style="transform:translate(${Number(offsetX)||0}mm,${Number(offsetY)||0}mm)"><p class="word-amount" dir="ltr">${escape(numeric)}</p><p class="word-words" dir="rtl">${escape(amountToArabicWords(amount))}</p><p class="word-beneficiary" dir="rtl">${escape(beneficiary)}</p><p class="word-date"><span class="word-date-value" dir="ltr">${escape(formattedDate)}</span><span class="word-city" dir="rtl">الرباط</span></p></div></div>`;
 }
 return `<div class="cheque"><div class="amount">${escape(Number(amount).toFixed(2))}</div><div class="words">${escape(root.amountToWords(amount))}</div><div class="beneficiary">${escape(beneficiary)}</div><div class="date">Rabat ${escape(formattedDate)}</div></div>`;
 }
 root.amountToArabicWords=amountToArabicWords;root.chequePrintMarkup=chequePrintMarkup;
 if(typeof module!=='undefined'&&module.exports)module.exports={amountToArabicWords,chequePrintMarkup};
})(globalThis);
