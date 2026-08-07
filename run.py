import os
import json
import urllib.request

# 1. 히라가나 / 가타카나 기호 제외 목록 (작은 글자는 포함)
SMALL_AND_SYMBOL_CHARS = {
    'ゎ', 'ゕ', 'ゖ', 'ゝ', 'ゞ', 'ゟ',
    'ヮ', 'ヵ', 'ヶ', '・', 'ー', 'ヽ', 'ヾ', 'ヿ'
}

# 2. 행(row) 매핑 테이블
ROW_MAPPING = {
    'a': ['あ', 'い', 'う', 'え', 'お', 'ア', 'イ', 'ウ', 'エ', 'オ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ'],
    'ka': ['か', 'き', 'く', 'け', 'こ', 'カ', 'キ', 'ク', 'ケ', 'コ'],
    'sa': ['さ', 'し', 'す', 'せ', 'そ', 'サ', 'シ', 'ス', 'セ', 'ソ'],
    'ta': ['た', 'ち', 'つ', 'て', 'と', 'タ', 'チ', 'ツ', 'テ', 'ト', 'っ', 'ッ'],
    'na': ['な', 'に', 'ぬ', 'ね', 'の', 'ナ', 'ニ', 'ヌ', 'ネ', 'ノ'],
    'ha': ['は', 'ひ', 'ふ', 'へ', 'ほ', 'ハ', 'ヒ', 'フ', 'ヘ', 'ホ'],
    'ma': ['ま', 'み', 'む', 'め', 'も', 'マ', 'ミ', 'ム', 'メ', 'モ'],
    'ya': ['や', 'ゆ', 'よ', 'ヤ', 'ユ', 'ヨ', 'ゃ', 'ゅ', 'ょ', 'ャ', 'ュ', 'ョ'],
    'ra': ['ら', 'り', 'る', 'れ', 'ろ', 'ラ', 'リ', 'ル', 'レ', 'ロ'],
    'wa': ['わ', 'を', 'ワ', 'ヲ', 'ゐ', 'ゑ', 'ヰ', 'ヱ'],
    'n': ['ん', 'ン'],
    'ga': ['が', 'ぎ', 'ぐ', 'げ', 'ご', 'ガ', 'ギ', 'グ', 'ゲ', 'ゴ'],
    'za': ['ざ', 'じ', 'ず', 'ぜ', 'ぞ', 'ザ', 'ジ', 'ズ', 'ゼ', 'ゾ'],
    'da': ['だ', 'ぢ', 'づ', 'で', 'ど', 'ダ', 'ヂ', 'ヅ', 'デ', 'ド'],
    'ba': ['ば', 'び', 'ぶ', 'べ', 'ぼ', 'バ', 'ビ', 'ブ', 'ベ', 'ボ'],
    'pa': ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ', 'パ', 'ピ', 'プ', 'ペ', 'ポ'],
    'va': ['ゔ', 'ヴ', 'ヷ', 'ヸ', 'ヹ', 'ヺ']
}

def get_row(char):
    for row, chars in ROW_MAPPING.items():
        if char in chars:
            return row
    return None

def build_kana_dataset(start_hex, end_hex):
    dataset = []
    for code_point in range(start_hex, end_hex + 1):
        char = chr(code_point)
        if char in SMALL_AND_SYMBOL_CHARS:
            continue
        row = get_row(char)
        if row:
            dataset.append({"id": char, "row": row})
    return dataset

# 3. 깃허브 Open Data에서 상용한자 2,136자 추출하는 함수
def fetch_joyo_kanji_data():
    url = "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json"
    
    print("📡 davidluzgouveia/kanji-data 저장소에서 원본 데이터 수신 중...")
    req = urllib.request.urlopen(url)
    data = json.loads(req.read().decode("utf-8"))

    # Grade 1~6(초등 교육한자) + Grade 8(중학 상용한자) = 총 2,136자 필터링
    joyo_kanji_dict = {
        k: v for k, v in data.items() if v.get("grade") in [1, 2, 3, 4, 5, 6, 8]
    }
    
    return joyo_kanji_dict

def save_json(file_path, data):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"📄 파일 저장 완료: {file_path}")

if __name__ == "__main__":
    print("🚀 Moji 앱 일본어 수집 데이터셋 생성 시작...\n")

    # 1. 히라가나 & 가타카나 데이터셋
    hiragana = build_kana_dataset(0x3041, 0x3096)
    katakana = build_kana_dataset(0x30A1, 0x30FA)
    
    save_json("src/data/ja/hiragana.json", hiragana)
    save_json("src/data/ja/katakana.json", katakana)

    # 2. 상용한자 데이터 추출 후 앱 경로(src/data/ja/kanji.json)에 저장
    try:
        joyo_dict = fetch_joyo_kanji_data()
        joyo_list = list(joyo_dict.keys())
        
        print(f"\n✅ 상용한자 추출 성공: 총 {len(joyo_list)}자")

        # 기존 경로(src/data/ja/kanji.json)에 앱용 구조({"id": "一"})로 저장
        app_kanji_data = [{"id": char} for char in joyo_list]
        save_json("src/data/ja/kanji.json", app_kanji_data)

    except Exception as e:
        print(f"❌ 데이터 처리 중 에러 발생: {e}")

    print("\n✨ 모든 파일이 지정된 경로(src/data/ja/)에 생성을 완료했습니다!")