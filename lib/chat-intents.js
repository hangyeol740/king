// 공개/가입한 채널만 읽습니다. 응답은 비공개 게임 상태를 참조하지 않습니다.
export function interpretChat(text){
 if(typeof text!=='string')return null;
  if(/(중재|반란).*(도와|지원|막)|중재해/.test(text))return {intent:'mediation',reply:'얼마나 부족해? 다른 사람도 지원한대?'};
  if(/원정.*(가자|갈|참가|도와|지원)|원정가/.test(text))return {intent:'expedition',reply:'하급으로 갈 거야, 상급으로 갈 거야?'};
  if(/거래.*(하자|해|할|받)|거래할/.test(text))return {intent:'trade',reply:'뭐가 필요한데? 어떤 조건으로 바꾸려고?'};
  if(/(가격|상품).*(낮|싸|할인)|할인해/.test(text))return {intent:'discount',reply:'어떤 상품이 비싼데? 얼마면 살 생각이야?'};
 if(/안녕|반가|하이/.test(text))return {intent:'greeting',reply:'안녕하세요! 같이 재미있게 플레이해요.'};
  if(/AI.*(있|대답|듣)|듣고 있/.test(text))return {intent:'presence',reply:'응, 듣고 있어. 무슨 얘기야?'};
 return null;
}
