// 장소 이름은 선택 사항이다. 업로드할 때 이름을 받지 않고 AUTO_PLACE_NAME 을 저장해 두면,
// 화면에는 방문 순서로 "1번째 장소", "2번째 장소"처럼 보여 준다.
// (places.name 은 DB 에서 1~100자 필수라 빈 값 대신 이 값을 쓴다. 장소를 지우거나 추억 제목을
//  바꿔도 번호가 자연스럽게 맞도록 순번은 저장하지 않고 화면에서 계산한다.)
// 사진 모아 보기의 "이름 수정"으로 언제든 이름을 붙이거나(비우면) 다시 뗄 수 있다.
export const AUTO_PLACE_NAME = '장소'

export const isAutoPlaceName = (name: string) => !name.trim() || name.trim() === AUTO_PLACE_NAME

// 화면에 보일 이름 (index 는 추억 안의 방문 순서, 0부터)
export const placeLabel = (name: string, index: number) => (isAutoPlaceName(name) ? `${index + 1}번째 장소` : name)
