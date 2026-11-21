export function activityDateRange(from:string,to:string):{from:string|null;to:string|null}{
 function date(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('날짜를 확인해주세요.');return new Date(value+'T00:00:00+09:00');}
 if(from&&to&&from>to)throw Error('시작 날짜가 종료 날짜보다 늦습니다.');
 return {from:from?date(from).toISOString():null,to:to?new Date(date(to).getTime()+86400000).toISOString():null};
}
