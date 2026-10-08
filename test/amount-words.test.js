const {test}=require('node:test');const assert=require('node:assert/strict');const {amountToWords}=require('../public/amount-words');
test('montants de chèques en français : dirhams, centimes et pluriels',()=>{
 const cases=[[1250,'mille deux cent cinquante dirhams'],[149,'cent quarante-neuf dirhams'],[59,'cinquante-neuf dirhams'],[500,'cinq cents dirhams'],[71,'soixante et onze dirhams'],[80,'quatre-vingts dirhams'],[81,'quatre-vingt-un dirhams'],[91,'quatre-vingt-onze dirhams'],[200000,'deux cent mille dirhams'],[80000,'quatre-vingt mille dirhams'],[2000000,'deux millions de dirhams'],[200000001,'deux cents millions un dirhams'],[1.01,'un dirham et un centime'],[1250.50,'mille deux cent cinquante dirhams et cinquante centimes'],[0.05,'zéro dirham et cinq centimes'],[1000000000,'un milliard de dirhams']];
 for(const [amount,expected] of cases)assert.equal(amountToWords(amount),expected.charAt(0).toUpperCase()+expected.slice(1));
 assert.equal(amountToWords(1,'EUR'),'Un euro');assert.throws(()=>amountToWords(-1));assert.throws(()=>amountToWords(Infinity));
});
