const PDFDocument=require('pdfkit');
async function invoicePdf(invoice,settings={},client={}){
 const pdf=new PDFDocument({size:'A4',margin:45,info:{Title:`${invoice.type} ${invoice.number}`,Author:settings.name||'GestStock'}}),chunks=[];
 const result=new Promise((resolve,reject)=>{pdf.on('data',c=>chunks.push(c));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);});
 const text=(value,size=10)=>pdf.fontSize(size).text(String(value||''),{width:505});
 const money=value=>Number(value||0).toFixed(2)+' '+(settings.currency||'MAD');
 text(settings.name||'GestStock',20);text(settings.address);text(settings.phone);if(settings.ice)text('ICE : '+settings.ice);pdf.moveDown();
 text(`${invoice.type} ${invoice.number}`,18);text('Date : '+String(invoice.date||'').slice(0,10));if(invoice.active===false)text('DOCUMENT INACTIF — POUR CONSULTATION');pdf.moveDown();
 text('Client : '+(invoice.clientName||'Client comptoir'),12);text(client.address);if(client.ice)text('ICE client : '+client.ice);pdf.moveDown();
 const header=()=>{pdf.font('Helvetica-Bold');text('Désignation / Quantité / Prix HT / Total HT',11);pdf.font('Helvetica');pdf.moveDown(.4);};header();
 for(const line of invoice.lines||[]){const value=`${line.name}\n${line.qty} × ${money(line.price)} = ${money(line.qty*line.price)} HT`;const height=pdf.heightOfString(value,{width:505})+12;if(pdf.y+height>760){pdf.addPage();header();}text(value);pdf.moveDown(.5);}
 if(pdf.y>665)pdf.addPage();pdf.moveDown();const ht=invoice.total/(1+Number(invoice.tax||0)/100);text('Total HT : '+money(ht),12);text(`TVA ${invoice.tax||0} % : `+money(invoice.total-ht),12);pdf.font('Helvetica-Bold');text('Total TTC : '+money(invoice.total),15);pdf.font('Helvetica');pdf.moveDown();text('Merci pour votre confiance.');pdf.end();return result;
}
module.exports={invoicePdf};
