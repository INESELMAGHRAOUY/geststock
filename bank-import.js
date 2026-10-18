const crypto=require('node:crypto'),path=require('node:path');
const money=s=>{const v=String(s).replace(/[\s\u00a0\u202f]/g,'');if(!/^\d+,\d{2}$/.test(v))throw Error('Montant bancaire illisible');const n=Number(v.replace(',','')) ;if(!Number.isSafeInteger(n))throw Error('Montant bancaire invalide');return n;};
const date=(d,m,y)=>{const s=`${y}-${m}-${d}`;if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Date bancaire invalide');return s;};
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
function bankPdfRows(pages){return pages.flatMap(page=>{const rows=[];for(const i of page.items.filter(i=>i.str.trim()).sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){let row=rows.find(r=>Math.abs(r.y-i.transform[5])<1);if(!row){row={y:i.transform[5],items:[],width:page.width};rows.push(row);}row.items.push(i);}return rows.map(r=>({...r,items:r.items.sort((a,b)=>a.transform[4]-b.transform[4]),text:r.items.map(i=>i.str).join(' ').replace(/\s+/g,' ').trim()}));});}
function parseAttijariPages(pages){
 const rows=bankPdfRows(pages);
 const all=rows.map(r=>r.text).join('\n');if(!/Attijariwafa\s*bank/i.test(all))throw Error('Le PDF ne correspond pas au modèle Attijari pris en charge.');
 const accounts=[...new Set((all.match(/\b\d{3}\s+\d{3}\s+\d{2}\s+\d{14}\s+\d{2}\b/g)||[]).map(s=>s.replace(/\s/g,'')))];if(accounts.length!==1)throw Error('Compte bancaire absent ou ambigu');
 const balanceRows=type=>rows.filter(r=>new RegExp('SOLDE '+type+' AU','i').test(r.text));
 const start=balanceRows('DEPART'),end=balanceRows('FINAL'),totals=rows.filter(r=>/TOTAL MOUVEMENTS/i.test(r.text));
 if(start.length!==1||end.length!==1||totals.length!==1)throw Error('Relevé incomplet ou plusieurs relevés dans le PDF : importez un relevé complet à la fois');
 const balance=row=>{const m=row.text.match(/AU (\d{2}) (\d{2}) (\d{4}) ([\d\s]+,\d{2}) (CREDITEUR|DEBITEUR)/i);if(!m)throw Error('Solde ou période illisible');return {date:date(m[1],m[2],m[3]),cents:money(m[4])*(m[5].toUpperCase()==='DEBITEUR'?-1:1)};};
 const opening=balance(start[0]),closing=balance(end[0]);if(opening.date>=closing.date)throw Error('Période bancaire invalide');
 const amounts=row=>row.items.filter(i=>/^[\d\s\u00a0\u202f]+,\d{2}$/.test(i.str));
 const totalAmounts=amounts(totals[0]);if(totalAmounts.length!==2)throw Error('Colonnes débit / crédit non reconnues');
 const columns=totalAmounts.map(i=>({end:(i.transform[4]+i.width)/totals[0].width,cents:money(i.str)}));
 const operations=[];for(const row of rows){const prefix=row.text.match(/^([A-Z0-9]{6}) (\d{2}) (\d{2})\b/);if(!prefix)continue;
  const values=amounts(row);if(values.length!==1)throw Error('Montant absent ou ambigu dans une opération');const amount=values[0],right=(amount.transform[4]+amount.width)/row.width;
  const debit=Math.abs(right-columns[0].end)<0.015,credit=Math.abs(right-columns[1].end)<0.015;if(debit===credit)throw Error('Sens débit / crédit ambigu');
  const text=row.items.filter(i=>i!==amount).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim(),dates=[...text.matchAll(/(\d{2}) (\d{2}) (\d{4})/g)],value=dates.at(-1);if(!value)throw Error('Date de valeur absente');
  const year=Number(closing.date.slice(0,4))-(Number(prefix[3])>Number(closing.date.slice(5,7))?1:0),booked=date(prefix[2],prefix[3],String(year));if(booked<=opening.date||booked>closing.date)throw Error('Opération hors période');
  const label=text.slice(prefix[0].length,value.index).trim();if(!label)throw Error('Libellé bancaire vide');const cents=money(amount.str);if(cents<=0)throw Error('Montant bancaire nul');
  operations.push({date:booked,valueDate:date(value[1],value[2],value[3]),code:prefix[1],label,debitCents:debit?cents:0,creditCents:credit?cents:0});
 }
 if(!operations.length||operations.length>10000)throw Error('Aucune opération lisible ou relevé trop volumineux');
 const debitCents=operations.reduce((n,o)=>n+o.debitCents,0),creditCents=operations.reduce((n,o)=>n+o.creditCents,0);
 if(debitCents!==columns[0].cents||creditCents!==columns[1].cents||opening.cents+creditCents-debitCents!==closing.cents)throw Error('Contrôle des totaux ou du solde échoué : aucune donnée importée');
 const occurrences=new Map();for(const operation of operations){const key=digest(JSON.stringify(operation)),n=(occurrences.get(key)||0)+1;occurrences.set(key,n);operation.key=key+':'+n;}
 return {provider:'attijari',account:accounts[0],accountMasked:'•••• '+accounts[0].slice(-4),from:opening.date,to:closing.date,openingCents:opening.cents,closingCents:closing.cents,debitCents,creditCents,operations};
}
function parseCdmPages(pages){
 const pageRows=pages.map(p=>bankPdfRows([p])),rows=pageRows.flat(),all=rows.map(r=>r.text).join('\n');
 if(!/Crédit du Maroc/i.test(all))throw Error('Le PDF ne correspond pas au modèle CDM pris en charge');
 const ribs=[...new Set([...all.matchAll(/\b(021)\s+(\d{3})\s+(\d{4})\s+(\d{12})\s+(\d{2})\s+MAD\b/g)].map(m=>m.slice(1).join('')))];if(ribs.length!==1)throw Error('Compte CDM absent ou ambigu');
 const starts=rows.filter(r=>/ANCIEN SOLDE AU/.test(r.text)),ends=rows.filter(r=>/NOUVEAU SOLDE AU/.test(r.text));if(starts.length!==1||ends.length!==1)throw Error('Relevé CDM incomplet ou plusieurs relevés dans le PDF');
 const amounts=r=>r.items.filter(i=>/^[\d\s\u00a0\u202f]+,\d{2}$/.test(i.str));
 const totals=rows.filter(r=>/TOTAL MOUVEMENTS/.test(r.text));if(totals.length!==pages.length)throw Error('Totaux de page CDM manquants');
 const columns=amounts(totals.at(-1)).map(i=>(i.transform[4]+i.width)/totals.at(-1).width);if(columns.length!==2)throw Error('Colonnes CDM non reconnues');
 const direction=(r,item)=>{const right=(item.transform[4]+item.width)/r.width,debit=Math.abs(right-columns[0])<0.015,credit=Math.abs(right-columns[1])<0.015;if(debit===credit)throw Error('Sens débit / crédit CDM ambigu');return debit?'debit':'credit';};
 const balance=r=>{const d=r.text.match(/(\d{2})\/(\d{2})\/(\d{4})/),a=amounts(r);if(!d||a.length!==1)throw Error('Solde CDM illisible');return {date:date(d[1],d[2],d[3]),cents:money(a[0].str)*(direction(r,a[0])==='debit'?-1:1)};};
 const opening=balance(starts[0]),closing=balance(ends[0]);if(opening.date>=closing.date)throw Error('Période CDM invalide');
 let debitCents=0,creditCents=0;const operations=[],categories=new Set(['CARTES','CHEQUES','OPERATIONS DIVERSES','VERSEMENTS ET RETRAITS D ESPECES','VIREMENTS','VIREMENTS ET MISES A DISPOSITION']);
 for(let pageIndex=0;pageIndex<pageRows.length;pageIndex++){
  const rows=pageRows[pageIndex],header=rows.find(r=>/Date Opération/.test(r.text)&&/Libellé/.test(r.text)),total=rows.find(r=>/TOTAL MOUVEMENTS/.test(r.text)),pageNumber=total?.text.match(/FEUILLET (\d+)/);
  if(!header||!total||!pageNumber||Number(pageNumber[1])!==pageIndex+1)throw Error('Page CDM manquante, répétée ou désordonnée');
  const reported=rows.filter(r=>/SOLDE REPORTE/.test(r.text));if(pageIndex>0){const a=reported[0]&&amounts(reported[0]);if(reported.length!==1||a.length!==1||money(a[0].str)*(direction(reported[0],a[0])==='debit'?-1:1)!==opening.cents+creditCents-debitCents)throw Error('Solde reporté CDM incohérent');}
  let last=null;for(const row of rows.filter(r=>r.y<header.y&&r.y>total.y)){
   if(/ANCIEN SOLDE|SOLDE REPORTE/.test(row.text)||categories.has(row.text)){last=null;continue;}
   const dates=row.items.filter(i=>/^\d{2} \d{2} \d{2}$/.test(i.str));
   if(dates.length){if(dates.length!==2)throw Error('Dates CDM ambiguës');const parse=s=>{const [d,m,y]=s.split(' ');return date(d,m,'20'+y);},booked=parse(dates[0].str),valueDate=parse(dates[1].str);if(booked<opening.date||booked>closing.date)throw Error('Opération CDM hors période');
    const a=amounts(row);if(a.length!==1)throw Error('Montant CDM absent ou ambigu');const cents=money(a[0].str),side=direction(row,a[0]);if(!cents)throw Error('Montant CDM nul');const label=row.items.filter(i=>!dates.includes(i)&&i!==a[0]).map(i=>i.str).join(' ').trim();if(!label)throw Error('Libellé CDM vide');
    last={date:booked,valueDate,code:'CDM',label,debitCents:side==='debit'?cents:0,creditCents:side==='credit'?cents:0};operations.push(last);debitCents+=last.debitCents;creditCents+=last.creditCents;
   }else if(row.text){if(!last||amounts(row).length||row.items.some(i=>i.transform[4]/row.width<0.33||i.transform[4]/row.width>0.65))throw Error('Ligne CDM non reconnue : import interrompu');last.label+=' · '+row.text;}
  }
  const a=amounts(total);if(a.length!==2||money(a[0].str)!==debitCents||money(a[1].str)!==creditCents)throw Error('Totaux cumulés CDM incohérents');
 }
 if(!operations.length||operations.length>10000||opening.cents+creditCents-debitCents!==closing.cents)throw Error('Contrôle des totaux ou du solde CDM échoué');
 const seen=new Map();for(const op of operations){const hash=digest(JSON.stringify(op)),n=(seen.get(hash)||0)+1;seen.set(hash,n);op.key=hash+':'+n;}
 return {provider:'cdm',account:ribs[0],accountMasked:'•••• '+ribs[0].slice(-4),from:opening.date,to:closing.date,openingCents:opening.cents,closingCents:closing.cents,debitCents,creditCents,operations};
}
async function readBankPdf(bytes,provider='auto'){
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true,verbosity:0,standardFontDataUrl:path.join(path.dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts')+path.sep});
 try{const pdf=await task.promise;if(pdf.numPages>30)throw Error('30 pages maximum');const pages=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),content=await page.getTextContent();pages.push({width:page.getViewport({scale:1}).width,items:content.items.filter(i=>typeof i.str==='string')});}const text=pages.flatMap(p=>p.items.map(i=>i.str)).join(' ');const detected=/Crédit du Maroc/i.test(text)?'cdm':/Attijariwafa\s*bank/i.test(text)?'attijari':null;if(!detected)throw Error('Format bancaire non reconnu : seuls les modèles Attijari et CDM fournis sont pris en charge');if(provider!=='auto'&&provider!==detected)throw Error('Le PDF ne correspond pas à la banque attendue');return detected==='cdm'?parseCdmPages(pages):parseAttijariPages(pages);}catch(error){if(/password/i.test(error.message))throw Error('Le PDF est protégé par mot de passe');throw error;}finally{await task.destroy();}
}
const readAttijariPdf=bytes=>readBankPdf(bytes,'attijari');
function createBankImportService({db,list,parsePdf=readBankPdf}){
 db.exec('CREATE TABLE IF NOT EXISTS bank_statements(id INTEGER PRIMARY KEY,bank_id INTEGER NOT NULL,file_hash TEXT NOT NULL,data TEXT NOT NULL,pdf BLOB NOT NULL,UNIQUE(bank_id,file_hash));CREATE TABLE IF NOT EXISTS bank_matches(statement_id INTEGER NOT NULL,operation_key TEXT NOT NULL,target_kind TEXT NOT NULL,target_id INTEGER NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(statement_id,operation_key),UNIQUE(target_kind,target_id))');
 const previews=new Map(),admin=user=>{if(user?.role!=='admin'){const error=Error('Accès administrateur requis');error.status=403;throw error;}},bank=id=>{const b=list('banks').find(b=>b.id===id&&b.active!==false);if(!b)throw Error('Banque indisponible');return b;};
 const readData=row=>({...JSON.parse(row.data),id:row.id,bankId:row.bank_id});
 const summaries=()=>db.prepare('SELECT id,bank_id,data FROM bank_statements ORDER BY id DESC').all().map(readData).map(({operations,...s})=>({...s,count:operations.length}));
 const duplicate=(id,p,hash)=>db.prepare('SELECT id,data FROM bank_statements').all().find(r=>{const s=JSON.parse(r.data);return s.fileHash===hash||(s.accountHash===digest(p.account)&&s.from<p.to&&s.to>p.from);});
 function candidates(bankId,op){const direction=op.creditCents?'credit':'debit',amount=op.creditCents||op.debitCents,targets=[];
  for(const [kind,rows] of [['settlements',list('settlements')],['expensePayments',list('expensePayments')],['jumiaPayouts',list('jumiaPayouts')]])for(const p of rows){if(p.active===false||p.bankId!==bankId||p.method==='Espèces'||p.status==='pending')continue;const signed=kind==='jumiaPayouts'?p.amountCents:(kind==='settlements'&&p.side==='client'?1:-1)*(p.amountCents??Math.round(p.amount*100));const actual=direction==='credit'?signed:-signed;if(actual!==amount)continue;const day=String(p.clearedDate||p.date||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Math.abs(Date.parse(day)-Date.parse(op.date))>7*86400000)continue;targets.push({kind,id:p.id,date:day,label:p.reference||p.label||p.statementNumber||'#'+p.id});}return targets;
 }
 return {summaries(user){admin(user);return summaries();},detail(user,id){admin(user);const row=db.prepare('SELECT id,bank_id,data FROM bank_statements WHERE id=?').get(id);if(!row)throw Error('Relevé introuvable');const data=readData(row),matches=db.prepare('SELECT operation_key AS operationKey,target_kind AS kind,target_id AS id FROM bank_matches WHERE statement_id=?').all(id);return {...data,operations:data.operations.map(op=>({...op,match:matches.find(m=>m.operationKey===op.key)||null,candidates:candidates(data.bankId,op)}))};},pdf(user,id){admin(user);const row=db.prepare('SELECT pdf FROM bank_statements WHERE id=?').get(id);if(!row)throw Error('Relevé introuvable');return row.pdf;},async handle(user,body){admin(user);
 if(body.action==='preview'){bank(body.bankId);if(!['auto','attijari','cdm'].includes(body.provider))throw Error('Modèle non pris en charge');if(typeof body.base64!=='string'||body.base64.length>7000000)throw Error('PDF : maximum 5 Mo');const bytes=Buffer.from(body.base64,'base64');if(bytes.length>5*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-'||bytes.toString('base64')!==body.base64)throw Error('PDF invalide (5 Mo maximum)');const parsed=await parsePdf(bytes,body.provider),hash=digest(bytes);if(duplicate(body.bankId,parsed,hash))throw Error('Ce relevé ou une période qui le recouvre est déjà importé pour ce compte');
 const configured=String(bank(body.bankId).rib||'').replace(/\D/g,'');if(configured.length===24&&configured!==parsed.account)throw Error('Le RIB du PDF ne correspond pas à la banque sélectionnée');
 for(const [key,p] of previews)if(p.expires<Date.now())previews.delete(key);if([...previews.values()].filter(p=>p.userId===user.id).length>=5)throw Error('Trop de prévisualisations. Attendez 15 minutes.');
 const token=crypto.randomBytes(24).toString('hex');previews.set(token,{userId:user.id,bankId:body.bankId,bytes,parsed,hash,fileName:String(body.fileName||'releve.pdf').slice(0,200),expires:Date.now()+15*60000});const {account,...data}=parsed;return {...data,token,count:parsed.operations.length};
 }
 if(body.action==='commit'){const p=previews.get(body.token);if(!p||p.userId!==user.id||p.expires<Date.now())throw Error('Prévisualisation expirée. Importez à nouveau le fichier');if(p.committedId)return {id:p.committedId,alreadyImported:true};if(body.confirmAccount!==true)throw Error('Confirmez le compte bancaire');const selectedBank=bank(p.bankId),rib=String(selectedBank.rib||'').replace(/\D/g,'');if(rib.length===24&&rib!==p.parsed.account)throw Error('Le RIB de la banque a changé. Recommencez la prévisualisation');db.exec('BEGIN IMMEDIATE');try{if(duplicate(p.bankId,p.parsed,p.hash))throw Error('Relevé déjà importé ou période déjà couverte');const {account,...parsed}=p.parsed;const data={...parsed,accountHash:digest(account),fileHash:p.hash,fileName:p.fileName,createdBy:user.name,createdAt:new Date().toISOString()};const id=Number(db.prepare('INSERT INTO bank_statements(bank_id,file_hash,data,pdf) VALUES(?,?,?,?)').run(p.bankId,p.hash,JSON.stringify(data),p.bytes).lastInsertRowid);db.exec('COMMIT');p.committedId=id;p.bytes=null;return {id};}catch(error){db.exec('ROLLBACK');throw error;}}
 if(body.action==='match'){if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='bank_allocations'").get()){const row=db.prepare('SELECT data FROM bank_allocations WHERE statement_id=? AND operation_key=?').get(body.statementId,body.operationKey);const a=row&&JSON.parse(row.data);if(a&&(a.type==='withdrawal'||a.personalCents>0))throw Error('Ligne personnelle, mixte ou retrait : rapprochement professionnel intégral interdit');}const detail=this.detail(user,body.statementId),op=detail.operations.find(o=>o.key===body.operationKey);if(!op)throw Error('Opération introuvable');const candidate=candidates(detail.bankId,op).find(c=>c.kind===body.kind&&c.id===body.targetId);if(!candidate)throw Error('Rapprochement incompatible : vérifiez le compte, le montant, la date et le sens');const old=db.prepare('SELECT * FROM bank_matches WHERE statement_id=? AND operation_key=?').get(detail.id,op.key);if(old){if(old.target_kind===candidate.kind&&old.target_id===candidate.id)return {id:detail.id};throw Error('Cette ligne est déjà rapprochée');}try{db.prepare('INSERT INTO bank_matches VALUES(?,?,?,?,?,?)').run(detail.id,op.key,candidate.kind,candidate.id,user.name,new Date().toISOString());}catch{throw Error('Cette opération comptable est déjà rapprochée');}return {id:detail.id};}
 throw Error('Action bancaire invalide');
 }};
}
module.exports={parseAttijariPages,parseCdmPages,readBankPdf,readAttijariPdf,createBankImportService};
