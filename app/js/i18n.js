(() => {
  "use strict";

  const languages = {
    cs: "Čeština", en: "English", de: "Deutsch", es: "Español", fr: "Français",
    it: "Italiano", pl: "Polski", uk: "Українська", pt: "Português", nl: "Nederlands",
    ja: "日本語", zh: "简体中文", ko: "한국어", tr: "Türkçe", sv: "Svenska"
  };
  const translations = {
    en: { connecting: "Connecting...", connectionFailed: "Unable to connect to the server.", stats: "Server statistics", install: "Install & AI models", connected: "Connected to server", disconnect: "Disconnect", refresh: "Refresh data", overview: "Server overview", dashboard: "Operations dashboard", monitor: "Monitor system health and manage your Docker services.", launcher: "Services & AI Launcher", launcherHelp: "Deploy trusted self-hosted services directly to this server.", collapse: "Collapse", expand: "Expand", deploy: "Install", ai: "AI Engine", aiHelp: "Select a model based on this server's available resources.", deployModel: "Install model", checking: "Checking hardware", cpu: "CPU usage", ram: "RAM utilization", temp: "CPU temperature", network: "Network usage", containers: "Active containers", noDocker: "Docker is not installed on this server.", noDockerHelp: "Install Docker on the remote host to manage containers from ShipAI.", portainer: "Docker management UI", nginx: "Reverse proxy and SSL", nextcloud: "Private files and collaboration", uptime: "Service availability monitoring", connect: "Connect server", secure: "Secure access", connectTitle: "Connect your server", connectHelp: "Enter your SSH details to open a secure management session.", password: "Password", host: "Host or IP address", port: "SSH port", username: "Username", security: "Credentials are sent over the encrypted SSH handshake and held in memory only.", sudoTitle: "Administrator permission required", sudoHelp: "Enter the sudo password to install Ollama. It is used once and never stored.", cancel: "Cancel", continue: "Continue", insufficient: "Insufficient RAM", installStarted: "Installation started...", cpuTip: "CPU usage shows how busy the processor is. Sustained high usage can slow services.", tempTip: "CPU temperature helps monitor cooling. Excess heat can reduce performance.", ramTip: "RAM controls how many services can run together. AI models need several GB of memory.", networkTip: "The network graph shows data transferred through the server interfaces.", dockerTip: "Containers isolate applications and dependencies so they are easy to run and update.", portainerTip: "Portainer provides a web interface for managing Docker containers.", nginxTip: "Nginx Proxy Manager handles reverse proxy routes and SSL certificates.", nextcloudTip: "Nextcloud provides private file storage and collaboration.", uptimeTip: "Uptime Kuma monitors service availability and incidents." },
    cs: { stats: "Statistiky a Docker", install: "Instalace & AI Modely", connected: "Připojeno k serveru", disconnect: "Odpojit", refresh: "Obnovit data", overview: "Přehled serveru", dashboard: "Ovládací panel", monitor: "Sledujte stav serveru a spravujte Docker služby.", launcher: "Služby a AI spouštěč", launcherHelp: "Instalujte ověřené služby přímo na server.", collapse: "Sbalit", expand: "Rozbalit", deploy: "Nainstalovat", ai: "AI Engine", aiHelp: "Vyberte model podle dostupných zdrojů serveru.", deployModel: "Nainstalovat model", checking: "Kontrola hardwaru", cpu: "Využití CPU", ram: "Využití RAM", temp: "Teplota CPU", network: "Využití sítě", containers: "Aktivní kontejnery", noDocker: "Na serveru není nainstalovaný Docker.", noDockerHelp: "Nainstalujte Docker pro správu kontejnerů ze ShipAI.", portainer: "Správa Dockeru", nginx: "Reverzní proxy a SSL", nextcloud: "Soukromé soubory a spolupráce", uptime: "Monitorování dostupnosti služeb", connect: "Připojit server", secure: "Bezpečný přístup", connectTitle: "Připojte svůj server", connectHelp: "Zadejte SSH údaje pro bezpečné připojení.", password: "Heslo", host: "Hostitel nebo IP adresa", port: "SSH port", username: "Uživatelské jméno", security: "Údaje jsou použity pouze během šifrovaného SSH připojení.", sudoTitle: "Vyžadováno oprávnění správce", sudoHelp: "Zadejte sudo heslo pro instalaci Ollamy. Použije se jednou a neukládá se.", cancel: "Zrušit", continue: "Pokračovat", insufficient: "Nedostatek RAM", installStarted: "Instalace spuštěna...", cpuTip: "Využití CPU ukazuje, jak vytížený je procesor. Dlouhodobě vysoké hodnoty mohou zpomalit služby.", tempTip: "Teplota CPU pomáhá hlídat chlazení domácího serveru. Vysoké teploty mohou snížit výkon.", ramTip: "RAM určuje, kolik služeb může běžet současně. AI modely potřebují několik GB paměti.", networkTip: "Síťový graf ukazuje přenos dat přes síťová rozhraní serveru.", dockerTip: "Kontejnery izolují aplikace a jejich závislosti, takže se snadno spouštějí a aktualizují." }
  };
  const base = translations.en;
  const localeCache = {};
  const extraLanguages = {
    de: { stats: "Serverstatistik", install: "Installation & KI-Modelle", disconnect: "Trennen", refresh: "Daten aktualisieren", deploy: "Installieren", checking: "Hardware wird geprüft", insufficient: "Nicht genug RAM" },
    es: { stats: "Estadísticas del servidor", install: "Instalación y modelos de IA", disconnect: "Desconectar", refresh: "Actualizar datos", deploy: "Instalar", checking: "Comprobando hardware", insufficient: "RAM insuficiente" },
    fr: { stats: "Statistiques du serveur", install: "Installation et modèles IA", disconnect: "Déconnecter", refresh: "Actualiser", deploy: "Installer", checking: "Vérification du matériel", insufficient: "RAM insuffisante" },
    it: { stats: "Statistiche del server", install: "Installazione e modelli IA", disconnect: "Disconnetti", refresh: "Aggiorna dati", deploy: "Installa", checking: "Controllo hardware", insufficient: "RAM insufficiente" },
    pl: { stats: "Statystyki serwera", install: "Instalacja i modele AI", disconnect: "Rozłącz", refresh: "Odśwież dane", deploy: "Zainstaluj", checking: "Sprawdzanie sprzętu", insufficient: "Niewystarczająca pamięć RAM" },
    uk: { stats: "Статистика сервера", install: "Встановлення та моделі ШІ", disconnect: "Від’єднати", refresh: "Оновити дані", deploy: "Встановити", checking: "Перевірка обладнання", insufficient: "Недостатньо RAM" },
    pt: { stats: "Estatísticas do servidor", install: "Instalação e modelos de IA", disconnect: "Desligar", refresh: "Atualizar dados", deploy: "Instalar", checking: "A verificar hardware", insufficient: "RAM insuficiente" },
    nl: { stats: "Serverstatistieken", install: "Installatie en AI-modellen", disconnect: "Verbinding verbreken", refresh: "Gegevens vernieuwen", deploy: "Installeren", checking: "Hardware controleren", insufficient: "Onvoldoende RAM" },
    ja: { stats: "サーバー統計", install: "インストールとAIモデル", disconnect: "切断", refresh: "データを更新", deploy: "インストール", checking: "ハードウェアを確認中", insufficient: "RAM不足" },
    zh: { stats: "服务器统计", install: "安装与 AI 模型", disconnect: "断开连接", refresh: "刷新数据", deploy: "安装", checking: "正在检查硬件", insufficient: "内存不足" },
    ko: { stats: "서버 통계", install: "설치 및 AI 모델", disconnect: "연결 해제", refresh: "데이터 새로 고침", deploy: "설치", checking: "하드웨어 확인 중", insufficient: "RAM 부족" },
    tr: { stats: "Sunucu istatistikleri", install: "Kurulum ve yapay zeka modelleri", disconnect: "Bağlantıyı kes", refresh: "Verileri yenile", deploy: "Kur", checking: "Donanım kontrol ediliyor", insufficient: "Yetersiz RAM" },
    sv: { stats: "Serverstatistik", install: "Installation och AI-modeller", disconnect: "Koppla från", refresh: "Uppdatera data", deploy: "Installera", checking: "Kontrollerar hårdvara", insufficient: "Otillräckligt RAM" }
  };
  Object.entries(extraLanguages).forEach(([code, values]) => { translations[code] = { ...base, ...values }; });
  Object.assign(translations.en, {
    language: "Language", infrastructure: "Infrastructure operations", dashboardSections: "Dashboard sections",
    restart: "Restart server", shutdown: "Shutdown server", modelProgress: "Model download progress",
    preparingDownload: "Preparing model download", waitingTransfer: "Waiting for transfer", modelsLibrary: "models in the library",
    checkingOllama: "Checking Ollama...", customPull: "Download any Ollama model", pullModel: "Download model",
    searchModels: "Search models, capabilities...", filterProfile: "Filter by deployment profile", allProfiles: "All profiles",
    loadingCatalogue: "Loading model definitions...", waitingTelemetry: "Waiting for telemetry", diskIo: "Disk I/O",
    systemMetrics: "System metrics", waitingDisk: "Waiting for disk telemetry...", initializingDocker: "Initializing Docker Environment...",
    container: "Container", image: "Image", status: "Status", actions: "Actions", installedModel: "Installed model",
    selectModel: "Select Installed Model", loadingModels: "Loading installed models...", idle: "Idle", responding: "Responding",
    clearConversation: "Clear Conversation", chatEmpty: "Select an installed Ollama model to start chatting.",
    messageModel: "Message your model...", stopGenerating: "Stop Generating", send: "Send", modelInstalled: "installed in Ollama",
    noModels: "No installed models found", start: "Start", stop: "Stop", logs: "Logs", running: "Running", stopped: "Stopped",
    synced: "Synced", noPorts: "No published ports", close: "Close", copyCode: "Copy Code", copied: "Copied",
    installed: "Installed", available: "Available", tryRun: "Try / Run", download: "Download", remove: "Remove",
    pulling: "Pulling...", modelDownload: "Model download", transferring: "Transferring over SSH", calculating: "Calculating transfer size...",
    downloadComplete: "Download complete", modelInstalledRemote: "Model installed on remote host", downloadFailed: "Download failed",
    newConnection: "New connection", savedProfile: "Saved server profile", delete: "Delete", profileName: "Profile name",
    optional: "optional", authMethod: "Authentication method", sshPassword: "SSH password", privateKey: "Private key file",
    privateKeyPath: "Private key path", sudoPassword: "Sudo password", saveProfile: "Save this server profile securely on this computer",
    productionServer: "Production GPU server", sshPasswordPlaceholder: "Enter your SSH password",
    defaultSudo: "Defaults to SSH password", enterHost: "Enter a host or IP address.", enterUsername: "Enter a username.",
    enterPassword: "Enter your SSH password or choose a saved profile.", enterKey: "Enter a private key path.",
    validPort: "Use a port between 1 and 65535.", deleteProfileConfirm: "Delete the saved profile?"
  });
  Object.assign(translations.cs, {
    connecting: "Připojování...", connectionFailed: "K serveru se nelze připojit.",
    enterHost: "Zadejte hostitele nebo IP adresu.", enterUsername: "Zadejte uživatelské jméno.", enterPassword: "Zadejte SSH heslo nebo vyberte uložený profil.",
    enterKey: "Zadejte cestu k privátnímu klíči.", validPort: "Použijte port mezi 1 a 65535.", deleteProfileConfirm: "Smazat uložený profil?",
    language: "Jazyk", infrastructure: "Správa infrastruktury", dashboardSections: "Sekce panelu",
    restart: "Restartovat server", shutdown: "Vypnout server", modelProgress: "Průběh stahování modelu",
    preparingDownload: "Příprava stahování modelu", waitingTransfer: "Čekání na přenos", modelsLibrary: "modelů v knihovně",
    checkingOllama: "Kontrola Ollamy...", customPull: "Stáhnout libovolný model z Ollamy", pullModel: "Stáhnout model",
    searchModels: "Hledat modely a schopnosti...", filterProfile: "Filtrovat podle profilu nasazení", allProfiles: "Všechny profily",
    loadingCatalogue: "Načítání definic modelů...", waitingTelemetry: "Čekání na telemetrii", diskIo: "Diskové I/O",
    systemMetrics: "Systémové metriky", waitingDisk: "Čekání na diskovou telemetrii...", initializingDocker: "Inicializace Dockeru...",
    container: "Kontejner", image: "Obraz", status: "Stav", actions: "Akce", installedModel: "Nainstalovaný model",
    selectModel: "Vybrat nainstalovaný model", loadingModels: "Načítání nainstalovaných modelů...", idle: "Připraveno", responding: "Odpovídá",
    clearConversation: "Vymazat konverzaci", chatEmpty: "Vyberte nainstalovaný model Ollama a začněte chatovat.",
    messageModel: "Napište zprávu modelu...", stopGenerating: "Zastavit generování", send: "Odeslat", modelInstalled: "nainstalováno v Ollamě",
    noModels: "Nebyly nalezeny nainstalované modely", start: "Spustit", stop: "Zastavit", logs: "Logy", running: "Běží", stopped: "Zastaveno",
    synced: "Synchronizováno", noPorts: "Žádné publikované porty", close: "Zavřít", copyCode: "Kopírovat kód", copied: "Zkopírováno",
    installed: "Nainstalováno", available: "Dostupné", tryRun: "Vyzkoušet / Spustit", download: "Stáhnout", remove: "Odstranit",
    pulling: "Stahování...", modelDownload: "Stahování modelu", transferring: "Přenos přes SSH", calculating: "Výpočet velikosti přenosu...",
    downloadComplete: "Stahování dokončeno", modelInstalledRemote: "Model nainstalován na vzdáleném hostiteli", downloadFailed: "Stahování selhalo",
    newConnection: "Nové připojení", savedProfile: "Uložený profil serveru", delete: "Smazat", profileName: "Název profilu",
    optional: "volitelné", authMethod: "Způsob ověření", sshPassword: "SSH heslo", privateKey: "Soubor privátního klíče",
    privateKeyPath: "Cesta k privátnímu klíči", sudoPassword: "Sudo heslo", saveProfile: "Bezpečně uložit tento profil serveru v počítači",
    productionServer: "Produkční GPU server", sshPasswordPlaceholder: "Zadejte SSH heslo",
    defaultSudo: "Standardně SSH heslo"
  });

  const translate = (key) => (translations[localStorage.getItem("shipai-language") || "en"] || base)[key] || base[key] || key;
  const apply = () => {
    const language = localStorage.getItem("shipai-language") || "en";
    document.documentElement.lang = language;
    document.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = translate(element.dataset.i18n); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = translate(element.dataset.i18nPlaceholder); });
    document.querySelectorAll("[data-i18n-title]").forEach((element) => { element.title = translate(element.dataset.i18nTitle); });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => { element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel)); });
    const selector = document.getElementById("language-select");
    if (selector) selector.value = language;
    window.dispatchEvent(new CustomEvent("shipai:language-changed", { detail: language }));
  };
  const loadLocale = async (language) => {
    if (localeCache[language]) return;
    try {
      const response = await fetch(`locales/${language}.json`, { cache: "no-store" });
      if (!response.ok) return;
      localeCache[language] = await response.json();
      translations[language] = { ...base, ...translations[language], ...localeCache[language] };
      apply();
    } catch {
      // The bundled dictionaries remain the offline fallback for file:// builds.
    }
  };
  const initialize = () => {
    const selector = document.getElementById("language-select");
    if (selector) {
      selector.replaceChildren(...Object.entries(languages).map(([value, label]) => {
        const option = document.createElement("option"); option.value = value; option.textContent = label; return option;
      }));
      selector.addEventListener("change", () => { localStorage.setItem("shipai-language", selector.value); apply(); loadLocale(selector.value); });
    }
    apply();
    loadLocale(localStorage.getItem("shipai-language") || "en");
  };
  window.shipaiI18n = Object.freeze({ languages, translate, apply });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true }); else initialize();
})();
