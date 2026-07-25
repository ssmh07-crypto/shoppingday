# 네이버 커머스API 고정 IP 중계 서버

Cloudflare Worker의 외부 호출 IP는 고정값으로 전제하지 않는다. 운영 Worker는 HTTPS 중계 서버에 HMAC 서명 요청을 보내고, 고정 공인 IPv4를 가진 중계 서버만 네이버 커머스API 인증정보를 보유하고 네이버를 호출한다.

## 보안 경계

- 중계 서버는 코드에 명시한 카테고리·상품 메타데이터·판매자 배송정보 조회,
  이미지 업로드와 상품 등록 경로만 제공하며 임의 URL·메서드·헤더 전달을 허용하지
  않는다.
- Worker와 중계 서버는 32자 이상의 `NAVER_COMMERCE_RELAY_SHARED_SECRET`을 공유한다.
- 서명에는 timestamp, nonce, HTTP 메서드, 경로와 쿼리, 대상 토큰 유형,
  판매자 ID/UID와 본문 SHA-256이 포함된다.
- 중계 서버는 기본 5분을 벗어난 요청과 재사용된 nonce를 거부한다.
- 네이버 Client ID와 Client Secret은 중계 서버에만 설정한다.
- 감사 로그에는 요청 ID, 메서드, 경로, 상태 코드, 처리 시간만 기록한다. 서명, 토큰, Secret, 요청·응답 본문은 기록하지 않는다.

현재 nonce 저장소는 단일 프로세스 메모리 방식이다. 릴레이를 여러 인스턴스로 확장하거나 쓰기 API를 추가하기 전에는 Redis 같은 공유 TTL 저장소로 교체하고 상품 발행 멱등성 키를 함께 적용한다.

## VM 배치

1. 고정 공인 IPv4가 있는 Linux VM을 준비하고 그 IP를 네이버 커머스API센터의 `API 호출 IP`에 등록한다.
2. 저장소와 Node.js 의존성을 설치한 뒤 중계 서버 전용 환경변수를 설정한다.
3. `npm run naver:relay`를 systemd 같은 프로세스 관리자로 실행한다.
4. Nginx 또는 Caddy에서 TLS를 종료하고 외부 HTTPS를 `127.0.0.1:8788`로 전달한다.
5. 방화벽에서는 SSH와 HTTPS만 허용하고 8788 포트를 외부에 직접 공개하지 않는다.

저장소의 `deploy/naver-relay/shoppingday-naver-relay.service`와
`deploy/naver-relay/Caddyfile`을 시작점으로 사용할 수 있다. systemd 서비스는 서버
부팅 시 자동 시작하고 장애 시 5초 뒤 재시작하므로 PC를 켜거나 Quick Tunnel 주소를
갱신할 필요가 없다. 실제 도메인, Linux 사용자와 설치 경로는 서버 환경에 맞게
바꾼다.

중계 서버 환경변수:

```dotenv
NAVER_RELAY_HOST=127.0.0.1
NAVER_RELAY_PORT=8788
NAVER_COMMERCE_API_URL=https://api.commerce.naver.com/external
NAVER_COMMERCE_CLIENT_ID=
NAVER_COMMERCE_CLIENT_SECRET=
NAVER_COMMERCE_TOKEN_TYPE=SELF
NAVER_COMMERCE_ACCOUNT_ID=
NAVER_COMMERCE_TIMEOUT_MS=15000
NAVER_COMMERCE_RELAY_SHARED_SECRET=
NAVER_RELAY_MAX_CLOCK_SKEW_MS=300000
```

다중 스토어 요청에서는 화면에서 선택한 연결의 `SELF/SELLER`와 판매자 ID/UID가
HMAC 서명된 요청 컨텍스트로 전달된다. 릴레이는 같은 Client ID와 Client Secret으로
해당 컨텍스트의 액세스 토큰을 발급한다. 다른 판매자 명의의 `SELLER` 연결은 해당
판매자가 Shoppingday 솔루션 접근을 승인한 경우에만 성공한다. 판매자별 Client
Secret은 DB나 브라우저로 전달하지 않는다.

공유 Secret은 암호학적 난수로 만들고 Worker와 중계 서버의 Secret 저장소에 각각 등록한다. 파일, Git, 일반 배포 로그에 값을 남기지 않는다.

## Worker 설정

Cloudflare Worker에는 네이버 Client ID와 Client Secret을 제거하고 다음 값만 설정한다.

```dotenv
NAVER_COMMERCE_RELAY_URL=https://relay.example.com
NAVER_COMMERCE_RELAY_SHARED_SECRET=
NAVER_COMMERCE_TIMEOUT_MS=15000
```

`NAVER_COMMERCE_RELAY_SHARED_SECRET`은 Cloudflare의 `Secret` 타입으로 관리한다. 릴레이 설정이 있으면 애플리케이션은 직접 호출보다 릴레이를 우선 사용한다.

## 점검

```bash
curl https://relay.example.com/healthz
npm run test -- tests/unit/naver-commerce-relay.test.ts
npm run typecheck
```

관리자 화면의 카테고리 동기화 버튼으로 실제 호출을 확인한다. 실패 시 Worker 응답 코드와 중계 서버의 `requestId`를 기준으로 확인하며, Secret이나 Access Token을 로그에 추가하지 않는다.

## 무료 로컬 PC + Quick Tunnel

네이버 자동 호출이 필요할 때만 로컬 PC를 켜는 운영에서는 무료 Quick Tunnel을 사용할 수 있다. Quick Tunnel은 실행할 때마다 주소가 바뀌므로 실행 스크립트가 새 주소를 Worker 변수에 반영하고 다시 배포한다.

최초 한 번 Cloudflare 로그인:

```powershell
npx wrangler login --use-keyring
```

이후 릴레이와 터널 실행:

```powershell
npm run naver:local-tunnel
```

릴레이는 HMAC 서명된 읽기 요청 중 카테고리, 상품 모델 검색, 카테고리별 상품
속성·속성값, 전체 속성 단위, 표준 옵션, 판매자 주소록, 묶음배송 그룹과 반품 택배사
경로만 허용한다. 카테고리 메타데이터 경로는 숫자형 `categoryId` 쿼리만 전달하며
단위·배송정보 조회는 임의 쿼리를 거부한다.

실행기는 다음 작업을 자동 처리한다.

1. `.env.local`의 네이버 인증정보를 확인한다.
2. 공유 Secret이 없으면 암호학적 난수로 생성해 Git에서 제외되는 `.env.relay.local`에 저장한다.
3. 로컬 릴레이를 `127.0.0.1:8788`에서 실행한다.
4. Cloudflare Quick Tunnel을 만들고 임시 HTTPS 주소를 확인한다.
5. Worker의 공유 Secret과 `NAVER_COMMERCE_RELAY_URL_OVERRIDE`를 Secret 바인딩으로 갱신한다. 기존 Linux Worker 번들은 다시 빌드하지 않는다.
6. `Ctrl+C`로 종료하면 로컬 릴레이와 터널도 종료한다.

PC 또는 터널이 꺼진 동안에도 저장된 상품과 카테고리 조회는 가능하지만, 네이버 API를 호출하는 동기화·발행 작업은 실패한다. Quick Tunnel은 개발·간헐적 관리자 작업용이며 24시간 자동 운영으로 취급하지 않는다.

## 상시 운영 선택

- 권장: 고정 공인 IPv4가 포함된 소형 Linux VM 한 대에 릴레이와 Caddy를 systemd로
  실행한다. 네이버 API센터에는 VM의 IPv4 한 개만 등록한다.
- 관리형 대안: Cloud Run에서 Direct VPC egress와 Cloud NAT의 예약 IP를 함께
  사용한다. 서버 관리는 줄지만 VPC·NAT 구성과 별도 비용이 추가된다.
- 일반 Cloudflare Worker나 Quick Tunnel만으로 네이버가 요구하는 전용 고정 출발
  IP를 만들 수 있다고 전제하지 않는다. Cloudflare Dedicated Egress IP는 Zero
  Trust Enterprise 추가 기능이므로 현재 규모의 기본안으로 사용하지 않는다.

Windows에서 생성한 OpenNext 번들은 런타임 서버 청크가 누락될 수 있으므로 실행 스크립트는 Worker 코드를 다시 빌드하거나 업로드하지 않는다. 애플리케이션 코드 변경을 운영에 배포할 때는 Cloudflare의 Linux 빌드 환경 또는 Linux 컨테이너에서 `npm run cf:build`를 실행한 결과를 사용한다. 평상시 `npm run naver:local-tunnel`은 기존 Linux 번들을 유지하고 두 Secret만 갱신한다.
