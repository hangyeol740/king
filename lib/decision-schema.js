// Validate the provider response locally as well as requesting strict JSON.
// Some compatible endpoints ignore response_format's strict flag.
export function validateSchema(value,schema,path='$'){
 if(!schema)return value;
 const types=Array.isArray(schema.type)?schema.type:[schema.type];
 const matches=type=>type===undefined||type==='null'&&value===null||type==='array'&&Array.isArray(value)||type==='object'&&value!==null&&typeof value==='object'&&!Array.isArray(value)||type==='integer'&&Number.isInteger(value)||type==='number'&&typeof value==='number'&&Number.isFinite(value)||type==='string'&&typeof value==='string'||type==='boolean'&&typeof value==='boolean';
 if(!types.some(matches))throw Error(`schema:${path}:type`);
 if(schema.enum&&!schema.enum.some(v=>JSON.stringify(v)===JSON.stringify(value)))throw Error(`schema:${path}:enum`);
 if(value===null)return value;
 if(typeof value==='string'&&schema.maxLength!==undefined&&value.length>schema.maxLength)throw Error(`schema:${path}:length`);
 if(typeof value==='number'&&(schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum))throw Error(`schema:${path}:range`);
 if(Array.isArray(value)){
  if(schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems)throw Error(`schema:${path}:items`);
  if(schema.items)value.forEach((v,i)=>validateSchema(v,schema.items,`${path}[${i}]`));
 }else if(typeof value==='object'){
  for(const key of schema.required||[])if(!Object.hasOwn(value,key))throw Error(`schema:${path}.${key}:required`);
  for(const [key,v] of Object.entries(value)){const child=schema.properties?.[key];if(child)validateSchema(v,child,`${path}.${key}`);else if(schema.additionalProperties===false)throw Error(`schema:${path}.${key}:unexpected`);}
 }
 return value;
}
