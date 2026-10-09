function purchaseLines(data,products){
 const input=data.lines??[data];if(!Array.isArray(input)||!input.length||input.length>200)throw Error('Ajoutez entre 1 et 200 articles');
 return input.map(l=>{const p=products.find(p=>p.id===l.productId&&p.active!==false);const unitPrice=l.unitPrice??l.price??0,discount=l.discount??0;
 if(!p||!Number.isFinite(l.qty)||l.qty<=0||!Number.isFinite(unitPrice)||unitPrice<0||!Number.isFinite(discount)||discount<0||discount>100)throw Error('Article, quantité, prix ou remise invalide');
 return {productId:p.id,name:p.name,sku:p.sku||'',barcode:p.barcode||'',qty:l.qty,unitPrice,discount,total:Math.round(l.qty*unitPrice*(1-discount/100)*100)/100};});
}
module.exports={purchaseLines};
