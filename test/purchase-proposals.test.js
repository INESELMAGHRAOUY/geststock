const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('public/app.js','utf8'),context={};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function purchaseProposals('),source.indexOf('function purchaseProposalsMarkup(')),context);
test('purchase proposals prioritise shortages and subtract only active pending quantities',()=>{
 const products=[{id:1,name:'Low',stock:2,min:5},{id:2,name:'Negative',stock:-2,min:5},{id:3,name:'Enough',stock:5,min:5},{id:4,name:'Disabled',stock:0,min:5,active:false},{id:5,name:'No threshold',stock:0,min:0},{id:6,name:'Covered',stock:1,min:5}];
 const movements=[{status:'pending',lines:[{productId:1,qty:1},{productId:6,qty:4}]},{status:'received',lines:[{productId:2,qty:20}]},{status:'pending',active:false,lines:[{productId:2,qty:20}]},{status:'pending',productId:1,qty:0.5}];
 const result=context.purchaseProposals(products,movements);assert.deepEqual(Array.from(result,r=>r.product.id),[2,5,6,1]);assert.equal(result[0].qty,7);assert.equal(result[1].qty,1);assert.equal(result[2].qty,0);assert.equal(result[3].qty,1.5);assert.equal(products[0].stock,2);assert.equal(context.purchaseProposals([],[]).length,0);
});
