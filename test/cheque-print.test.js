const {test}=require('node:test');const assert=require('node:assert/strict');const {amountToArabicWords,chequePrintMarkup}=require('../public/cheque-print');
test('conversion arabe et modèle Word CDM',()=>{
 assert.equal(amountToArabicWords(2150),'ألفان ومائة وخمسون درهما');
 assert.equal(amountToArabicWords(1250),'ألف ومائتان وخمسون درهما');
 assert.equal(amountToArabicWords(149.50),'مائة وتسعة وأربعون درهما وخمسون سنتيما');
 assert.equal(amountToArabicWords(500),'خمسمائة درهما');
 assert.throws(()=>amountToArabicWords(-1));
 const escape=s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;');
 const html=chequePrintMarkup({amount:2150,beneficiary:'<client>',date:'2026-10-14',offsetX:1,offsetY:-2},escape);
 assert.match(html,/#2 150.00#/);assert.match(html,/14\/10\/2026/);assert.match(html,/الرباط/);assert.match(html,/&lt;client&gt;/);assert.match(html,/translate\(1mm,-2mm\)/);assert.match(html,/ألفان ومائة وخمسون درهما/);
});
