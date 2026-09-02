/** @type {import('next').NextConfig} */
const nextConfig = {
  // 개인용 로컬 도구다. 생성 에셋은 data/ 밖으로 나가지 않는다.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
