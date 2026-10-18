const {test}=require('node:test'),assert=require('node:assert/strict'),{parseCdmPages}=require('../bank-import');
function fixture({report='130,00',closing='120,00',pageNumber=2,totalDebit='30,00'}={}){
 const page=()=>({width:600,items:[]});const pages=[page(),page()];let current,y;
 const add=items=>{for(const [str,x,width] of items)current.items.push({str,width:width??str.length*6,transform:[1,0,0,1,x,y]});y-=20;};
 const header=p=>{current=p;y=760;add([['Crédit du Maroc',10]]);add([['021 810 0000 123456789012 34 MAD',10]]);add([['Date Opération Valeur Libellé Débit Crédit',10]]);};
 const operation=(booked,value,label,amount,credit)=>add([[booked,50],[value,150],[label,216],[amount,credit?550:440,30]]);
 const total=(number,debit,credit)=>add([['FEUILLET '+number+' TOTAL MOUVEMENTS',10],[debit,440,30],[credit,550,30]]);
 header(pages[0]);add([['ANCIEN SOLDE AU 31/07/2026',216],['100,00',550,30]]);operation('31 07 26','31 07 26','PAIEMENT CARTE','20,00',false);add([['COMMERCE A',216]]);operation('05 08 26','06 08 26','VIREMENT RECU','50,00',true);add([['EMETTEUR A',216]]);total(1,'20,00','50,00');
 header(pages[1]);add([['SOLDE REPORTE',216],[report,550,30]]);operation('31 08 26','01 09 26','VIREMENT EMIS','10,00',false);total(pageNumber,totalDebit,'50,00');add([['NOUVEAU SOLDE AU 31/08/2026',117],[closing,550,30]]);return pages;
}
test('CDM reads cumulative page totals once, continuation labels and value dates in the next month',()=>{const p=parseCdmPages(fixture());assert.equal(p.provider,'cdm');assert.equal(p.account.length,24);assert.equal(p.operations.length,3);assert.equal(p.debitCents,3000);assert.equal(p.creditCents,5000);assert.equal(p.closingCents,12000);assert.equal(p.operations[0].date,'2026-07-31');assert.equal(p.operations[0].label,'PAIEMENT CARTE · COMMERCE A');assert.equal(p.operations[1].label,'VIREMENT RECU · EMETTEUR A');assert.equal(p.operations[2].valueDate,'2026-09-01');});
test('CDM rejects missing pages, incorrect page order, carry-forwards, totals and closing balances',()=>{assert.throws(()=>parseCdmPages(fixture().slice(1)),/incomplet/);assert.throws(()=>parseCdmPages(fixture({pageNumber:3})),/Page CDM/);assert.throws(()=>parseCdmPages(fixture({report:'131,00'})),/reporté/);assert.throws(()=>parseCdmPages(fixture({totalDebit:'31,00'})),/cumulés/);assert.throws(()=>parseCdmPages(fixture({closing:'121,00'})),/solde CDM/);});
test('CDM recognizes remote banking section headings without treating them as transactions or label continuations',()=>{
 const pages=fixture(),expected=parseCdmPages(pages);for(const y of [690,650])pages[0].items.push({str:'BANQUE A DISTANCE',width:100,transform:[1,0,0,1,216,y]});assert.deepEqual(parseCdmPages(pages),expected);
 const unknown=fixture();unknown[0].items.push({str:'SECTION INCONNUE',width:100,transform:[1,0,0,1,216,690]});assert.throws(()=>parseCdmPages(unknown),/Ligne CDM non reconnue/);
});
