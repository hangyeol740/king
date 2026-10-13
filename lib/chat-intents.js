// 공개/가입한 채널만 읽습니다. 응답은 비공개 게임 상태를 참조하지 않습니다.
export function interpretChat(text){
 if(typeof text!=='string')return null;
 if(/(중재|반란).*(도와|지원|막)|중재해/.test(text))return {intent:'mediation',reply:'중재 요청 확인했어요. 제 차례에 가능한 지원을 판단할게요.'};
 if(/원정.*(가자|참가|도와|지원)|원정가/.test(text))return {intent:'expedition',reply:'원정 제안 확인했어요. 참가와 카드 제출은 상황에 맞춰 판단할게요.'};
 if(/거래.*(하자|해|할|받)|거래할/.test(text))return {intent:'trade',reply:'거래 제안 확인했어요. 실제 거래 요청을 보내주면 판단할게요.'};
 if(/(가격|상품).*(낮|싸|할인)|할인해/.test(text))return {intent:'discount',reply:'가격 의견 확인했어요. 가격 변경은 상인의 저녁 준비 때 가능합니다.'};
 if(/안녕|반가|하이/.test(text))return {intent:'greeting',reply:'안녕하세요! 같이 재미있게 플레이해요.'};
 if(/AI.*(있|대답|듣)|듣고 있/.test(text))return {intent:'presence',reply:'채팅을 확인하고 있어요. 중재·원정·거래 같은 간단한 제안을 이해할 수 있어요.'};
 return null;
}
