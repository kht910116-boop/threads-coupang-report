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
  outputFileTracingExcludes: {
    "*": [
      "node_modules/electron/**",
      "node_modules/electron-builder/**",
      "node_modules/app-builder-lib/**",
      "node_modules/@electron/**",
      "node_modules/typescript/**",
    ],
  },
};

export default nextConfig;
