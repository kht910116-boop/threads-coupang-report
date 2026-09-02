const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

/**
 * 데스크톱 껍데기.
 *
 * 이 앱의 알맹이는 Next.js 서버다. API 라우트가 구독 CLI를 spawn하고, 브라우저를
 * 몰고, data 폴더를 읽고 쓴다. 그래서 정적 파일로 뽑아 껍데기에 넣을 수 없다 —
 * **서버를 앱 안에서 띄우고 창이 그걸 본다.**
 *
 * 사용자에게 Node 설치나 npm install을 시키지 않으려고, 서버는 Electron이 이미
 * 들고 있는 Node로 돌린다(ELECTRON_RUN_AS_NODE). 그래서 준비물이 크롬 하나로 준다.
 */

/**
 * 서버 코드가 있는 곳.
 *
 * 포장하면 resources/server, 개발 중이면 저장소의 .next/standalone이다.
 * 포장본에서 앱 코드(resources/app) 옆이 아니라 따로 두는 이유는 electron-builder가
 * 앱 코드 쪽 node_modules를 특별 취급해 빼버리기 때문이다 (electron-builder.yml 참고).
 */
function resolveServerDir() {
  const packaged = path.join(process.resourcesPath, "server");
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, "..", ".next", "standalone");
}

/**
 * 프로젝트·에셋·내보내기·브라우저 프로파일이 사는 곳.
 *
 * 사용자가 결과물을 탐색기로 찾아가야 하므로 실행 파일 옆 `app-data`를 먼저 쓴다.
 * 다만 Program Files에 설치하면 거기는 못 쓰므로, 쓸 수 없으면 사용자 폴더로 물러선다.
 * 둘 다 싫으면 AUTOTUBE_DATA_DIR로 덮어쓴다.
 */
function resolveDataDir() {
  if (process.env.AUTOTUBE_DATA_DIR) {
    return path.resolve(process.env.AUTOTUBE_DATA_DIR);
  }
  const beside = path.join(path.dirname(process.execPath), "app-data");
  try {
    fs.mkdirSync(beside, { recursive: true });
    fs.accessSync(beside, fs.constants.W_OK);
    return beside;
  } catch {
    return path.join(app.getPath("userData"), "app-data");
  }
}

/**
 * 빈 포트를 하나 받아둔다.
 *
 * 3000을 그냥 쓰면 사용자가 다른 개발 서버를 띄워둔 날 앱이 안 뜬다.
 * OS에게 0번을 요청해 실제로 비어 있는 번호를 받아 쓴다.
 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** 서버가 응답할 때까지 기다린다. 창을 먼저 열면 빈 화면이 뜬다. */
async function waitForServer(origin, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(origin, { method: "HEAD" });
      if (res.status < 500) return;
    } catch {
      // 아직 안 떴다. 잠시 뒤 다시 본다.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("서버가 제한 시간 안에 뜨지 않았습니다.");
}

let serverProcess = null;
/** 서버가 죽으며 남긴 말. 창이 안 뜰 때 사용자에게 보여줄 유일한 단서다. */
let serverLog = "";

async function startServer() {
  const serverDir = resolveServerDir();
  const entry = path.join(serverDir, "server.js");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `서버 파일을 찾지 못했습니다: ${entry}\n개발 중이라면 먼저 \`npm run build\`를 실행하세요.`,
    );
  }

  const port = await findFreePort();
  const dataDir = resolveDataDir();

  serverProcess = spawn(process.execPath, [entry], {
    cwd: serverDir,
    env: {
      ...process.env,
      // Electron 바이너리를 순수 Node로 쓰겠다는 신호. 이게 없으면 서버가 아니라
      // 두 번째 Electron 앱이 뜬다.
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      // 외부에서 접속 가능한 주소로 열면 같은 공유기의 다른 기기가 남의 구독 세션을
      // 쓸 수 있다. 개인용 도구이므로 이 PC에만 연다.
      HOSTNAME: "127.0.0.1",
      AUTOTUBE_DATA_DIR: dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const collect = (chunk) => {
    serverLog = `${serverLog}${chunk}`.slice(-4000);
  };
  serverProcess.stdout.on("data", collect);
  serverProcess.stderr.on("data", collect);

  const origin = `http://127.0.0.1:${port}`;
  await waitForServer(origin, 60000);
  return { origin, dataDir };
}

function stopServer() {
  if (!serverProcess) return;
  const child = serverProcess;
  serverProcess = null;
  child.kill();
}

function buildMenu(origin, dataDir) {
  return Menu.buildFromTemplate([
    {
      label: "파일",
      submenu: [
        {
          label: "데이터 폴더 열기",
          // 내보낸 결과물을 여기서 찾는다. 경로를 외우게 하지 않으려고 메뉴에 둔다.
          click: () => shell.openPath(dataDir),
        },
        {
          label: "브라우저로 열기",
          // 앱 창이 말썽일 때의 퇴로. 같은 서버를 평소 브라우저로도 볼 수 있다.
          click: () => shell.openExternal(origin),
        },
        { type: "separator" },
        { label: "종료", role: "quit" },
      ],
    },
    {
      label: "보기",
      submenu: [
        { label: "새로고침", role: "reload" },
        { label: "확대", role: "zoomIn" },
        { label: "축소", role: "zoomOut" },
        { label: "원래 크기", role: "resetZoom" },
        { type: "separator" },
        { label: "전체 화면", role: "togglefullscreen" },
        { label: "개발자 도구", role: "toggleDevTools" },
      ],
    },
  ]);
}

function createWindow(origin, dataDir) {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: "AutoTube Studio",
    backgroundColor: "#0b0b0d",
    // 창을 먼저 만들어 두되 그릴 준비가 될 때까지 감춰둔다. 흰 화면이 번쩍이지 않는다.
    show: false,
    webPreferences: {
      // 렌더러는 그냥 로컬 웹페이지다. Node를 열어줄 이유가 없다.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // 레퍼런스 링크 같은 바깥 주소는 앱 창이 아니라 평소 브라우저에서 연다.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(origin)) shell.openExternal(url);
    return { action: "deny" };
  });

  Menu.setApplicationMenu(buildMenu(origin, dataDir));
  win.loadURL(origin);
  return win;
}

/**
 * 두 번 켜지 못하게 막는다.
 *
 * 같은 data 폴더를 두 프로세스가 쓰면 프로젝트 저장이 서로를 덮어쓴다. 게다가
 * 크롬은 같은 프로파일 폴더를 동시에 두 번 열지 못해 구독 웹 작업이 통째로 깨진다.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    try {
      const { origin, dataDir } = await startServer();
      createWindow(origin, dataDir);

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(origin, dataDir);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox(
        "AutoTube Studio를 시작하지 못했습니다",
        serverLog ? `${reason}\n\n--- 서버 기록 ---\n${serverLog}` : reason,
      );
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    // 창을 닫으면 서버도 같이 내린다. 안 그러면 보이지 않는 서버가 계속 남는다.
    stopServer();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", stopServer);
}
