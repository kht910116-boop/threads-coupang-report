/** @type {import('next').NextConfig} */
const nextConfig = {
  // 개인용 로컬 도구다. 생성 에셋은 data/ 밖으로 나가지 않는다.
  serverExternalPackages: ["@anthropic-ai/sdk", "playwright-core"],

  // 데스크톱 앱(.exe)으로 포장하려면 서버가 자립해야 한다. standalone은 실제로
  // 쓰는 모듈만 추린 server.js와 node_modules를 뱉으므로, 그걸 Electron 안에서
  // 그대로 띄운다. 사용자 PC에 Node나 npm install이 필요 없어진다.
  output: "standalone",

  // 포장 도구들은 서버가 쓰지 않는데도 추적에 걸려 들어온다. 특히 electron은
  // 패키지 안에 브라우저 바이너리를 통째로 들고 있어서, 빼지 않으면 서버 번들이
  // 36MB에서 305MB로 부푼다. 그러고도 정작 쓰이지 않는다.
  //
  // 추적기가 프로젝트 루트를 통째로 훑는 일이 있다. 런타임에 경로를 조립해
  // 파일을 읽는 코드가 있으면 그 폴더 전체가 후보가 되기 때문이다. 그대로 두면
  // 두 가지가 새어 나간다.
  //
  //   dist/  포장 결과물이 다음 포장에 다시 들어간다. 116MB → 314MB로 불었고
  //          돌릴수록 커진다.
  //   data/  **사용자의 프로젝트와 음성 파일이 설치 파일에 딸려 나간다.**
  //          남에게 설치 파일을 건네면 내 대본과 목소리가 같이 간다.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/electron/**",
      "node_modules/electron-builder/**",
      "node_modules/app-builder-lib/**",
      "node_modules/@electron/**",
      "node_modules/typescript/**",
      // 경로를 구체적으로 적는다. `dist/**`처럼 짧게 쓰면 앵커가 없어서
      // `node_modules/next/dist/**`까지 걸려 든다. 실제로 그렇게 해서
      // app-route-turbo.runtime.prod.js가 빠졌고, 앱이 뜨긴 하는데 모든
      // API가 500을 냈다.
      "dist/win-unpacked/**",
      "dist/*.exe",
      //
      // data/ 는 통째로 뺀다. 여기에는 사용자의 대본·음성·**API 키**가 있다.
      // 남에게 설치 파일을 건네면 내 키가 같이 간다. 실제로 secrets.json이
      // 포장본에 들어가 있었다.
      //
      // 앱은 data/ 없이 떠야 한다 — 설정 파일은 없으면 기본값으로 새로
      // 만들어지고, 실행 중에는 %APPDATA% 쪽을 쓴다.
      "data/**/*",
    ],
  },
};

export default nextConfig;
