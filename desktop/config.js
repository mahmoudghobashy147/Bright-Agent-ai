'use strict';
const {validatedTarget}=require('./url-policy');
function cloudTarget(value){
 const u=validatedTarget(value);
 if(u.protocol!=='https:'||u.search)throw Error('أدخل رابط لوحة الشركة الآمن بصيغة https://your-server/console/');
 return u.toString();
}
module.exports={cloudTarget};
