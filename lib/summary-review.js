export async function reviewSummary(client,scope,summary,evidence){
 if(!summary?.text)return null;
 const ids=new Set(summary.evidenceIds),sources=evidence.filter(e=>ids.has(e.id));
 if(!sources.length||sources.length!==ids.size)throw Error('unsupported_belief');
 const out=await client.ask('원본과 기억요약의 의미를 비교한다. 원문은 조건부인데 동의로 단정하거나, 주장/추정을 사실로 바꾸거나, 수량/대상을 바꾸면 valid=false. 요약을 새 사실의 출처로 삼지 않는다.',{scope,summary:summary.text,sources},{type:'object',properties:{valid:{type:'boolean'},reason:{type:'string'}},required:['valid','reason'],additionalProperties:false});
 return out.valid?summary:{text:sources.map(e=>`[${e.kind}] ${e.text}`).join('\n').slice(0,1000),evidenceIds:sources.map(e=>e.id)};
}
