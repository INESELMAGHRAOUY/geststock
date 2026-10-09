(function(root){
function parseJumiaCSV(text){
 if(typeof text!=='string'||text.length>2*1024*1024)throw Error('CSV : maximum 2 Mo');
 text=text.replace(/^\uFEFF/,'');const delimiter=text.slice(0,text.indexOf('\n')).includes(';')?';':',';const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else throw Error('CSV mal formé');}else if(!quoted&&(c===delimiter||c==='\n'||c==='\r')){row.push(cell);cell='';if(c!==delimiter){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];}}else cell+=c;}
 if(quoted)throw Error('CSV : guillemets incomplets');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 const headers=rows.shift()?.map(h=>h.trim());const required=['Transaction Date','Transaction Type','Transaction Number','Transaction State','Seller SKU','Amount','Paid Status','Order No.','Order Item No.','Country Code'];if(!headers||required.some(h=>!headers.includes(h)))throw Error('Export transactions Jumia attendu : colonnes manquantes');
 if(!rows.length||rows.length>10000)throw Error('CSV vide ou plus de 10 000 transactions');const seen=new Set();return rows.map((r,i)=>{if(r.length!==headers.length)throw Error('Nombre de colonnes invalide : ligne '+(i+2));const t=Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));if(t['Country Code']!=='MA')throw Error('Seuls les relevés Morocco / MAD sont acceptés');const amount=t.Amount.replace(/\s/g,'').replace(',','.');if(!/^-?\d+(\.\d{1,2})?$/.test(amount))throw Error('Montant invalide : ligne '+(i+2));t.amountCents=Math.round(Number(amount)*100);if(!Number.isSafeInteger(t.amountCents)||!t['Transaction Number']||seen.has(t['Transaction Number']))throw Error('Transaction invalide ou dupliquée dans le fichier');seen.add(t['Transaction Number']);return t;});
}
function analyzeJumiaTransactions(rows){
 const approved=rows.filter(t=>t['Transaction State']==='APPROVED');let sales=0,commission=0,shipping=0,net=0,paid=0,open=0;const types=new Map(),orders=new Map(),skus=new Map();
 for(const t of approved){const a=t.amountCents,type=t['Transaction Type'];net+=a;if(type==='Item Price Credit')sales+=a;if(type==='Commission')commission-=a;if(type==='Shipping Cost Contribution')shipping-=a;if(t['Paid Status']==='PAID')paid+=a;else open+=a;types.set(type,(types.get(type)||0)+a);
 for(const [map,key] of [[orders,t['Order No.']||'Sans commande'],[skus,t['Seller SKU']||'Sans SKU']]){const g=map.get(key)||{key,sales:0,fees:0,net:0};g.net+=a;if(type==='Item Price Credit')g.sales+=a;else g.fees-=a;map.set(key,g);}}
 return {count:rows.length,approved:approved.length,excluded:rows.length-approved.length,sales,commission,shipping,net,paid,open,types:[...types].map(([key,net])=>({key,net})),orders:[...orders.values()],skus:[...skus.values()]};
}
root.analyzeJumiaTransactions=analyzeJumiaTransactions;if(typeof module!=='undefined'&&module.exports)module.exports={parseJumiaCSV,analyzeJumiaTransactions};
})(globalThis);
