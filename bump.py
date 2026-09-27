# 배포 시 자산 버전을 갱신해 브라우저 캐시를 무효화
import re, time, pathlib
v = time.strftime("%Y%m%d%H%M")
p = pathlib.Path("index.html"); s = p.read_text(encoding="utf-8")
s = re.sub(r'href="style\.css(\?v=[^"]*)?"', f'href="style.css?v={v}"', s)
s = re.sub(r'src="data\.js(\?v=[^"]*)?"', f'src="data.js?v={v}"', s)
s = re.sub(r'src="app\.js(\?v=[^"]*)?"', f'src="app.js?v={v}"', s)
p.write_text(s, encoding="utf-8")
print("asset version ->", v)
