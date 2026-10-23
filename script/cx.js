// noinspection SpellCheckingInspection
//吹雪
const countryRegex = {
    HK: /🇭🇰|香港/i,
    TW: /🇹🇼|台湾/i,
    JP: /🇯🇵|日本/i,
    KR: /🇰🇷|韩国/i,
    SG: /🇸🇬|新加坡|狮城/i,
    US: /🇺🇸|美国/i,
    UK: /🇬🇧|英国/i,
    DE: /🇩🇪|德国/i,
};
const xsNodeNames = {
    xs_JP: ["🇯🇵日本·三网|软银1", "🇯🇵日本·三网|软银2", "🇯🇵日本·三网|软银3", "🇯🇵日本·三网|软银4"],
    xs_EU: ["🇩🇪德国|法兰克福-1", "🇩🇪德国|法兰克福-2", "🇫🇷法国|巴黎世家-1", "🇫🇷法国|巴黎世家-2", "🇳🇱荷兰|阿姆斯特丹2"],
    xs_US: ["🇺🇸美·洛杉矶|专线-DS2", "🇺🇸美·盐湖城|专线-DS1", "🇺🇸美·盐湖城|专线-DS2", "🇺🇸美·凤凰城|专线-BP1", "🇺🇸美·凤凰城|专线-BP2", "🇺🇸美·凤凰城|专线-BP3", "🇺🇸美·凤凰城|专线-BP4", "🇺🇸美·凤凰城|专线-BP5", "🇺🇸美·凤凰城|专线-BP6",]
};

const gzNodeNames = {
    gz_SG: ["🇸🇬新加坡-限免01"],
    gz_KR: ["🇰🇷韩国-01 | 家宽", "🇰🇷韩国-02 | 家宽"],
    gz_DE: ["🇩🇪德国-01", "🇩🇪德国-02"],
    gz_JP: ["🇯🇵日本-03", "🇯🇵日本-04", "🇯🇵日本-05", "🇯🇵日本-06"],
}
const countries = [...Object.keys(countryRegex), "Other"];
const testURL = "https://www.gstatic.com/generate_204";


const main = function (config) {
    // 删除不需要的节点
    config.proxies = config.proxies.filter(
        ({name}) => !/试验|更新|套餐|剩余|电信/i.test(name)
    );

    const nodes = classifyNodes(config.proxies);

    config.proxies.push(...addExternalNodes());
    // 创建代理组
    config["proxy-groups"] = createProxyGroups(nodes);

    // 添加分流规则
    config.rules = [...getRules(), "MATCH,Default"];

    return config;
};

function classifyNodes(proxies) {
    const nodes = {
        All: proxies.map(({name}) => name),
        YL: Object.fromEntries(countries.map((country) => [country, []])),
    };

    for (const {name} of proxies) {
        if (!/移联/i.test(name)) continue;

        const country = countries.find(
            (item) => item !== "Other" && countryRegex[item].test(name)
        ) || "Other";

        nodes.YL[country].push(name);
    }

    return nodes;
}

function createProxyGroups(nodes) {
    const {All} = nodes;
    const {HK, TW, JP, SG, US} = nodes.YL;
    const {xs_US, xs_EU, xs_JP} = xsNodeNames;
    const {gz_SG, gz_KR, gz_JP, gz_DE} = gzNodeNames
    const defaultGroup = {
        name: "Default",
        type: "select",
        proxies: [
            "Auto",

            ...countries.flatMap((country) => nodes.YL[country]),
            "DIRECT",
        ],
    };

    const autoGroup = {
        name: "Auto",
        type: "fallback",
        proxies: All,
    };

    const serviceGroups = [
        {
            name: "YouTube",
            type: "url-test",
            proxies: [...TW, ...SG, ...JP, ...HK, ...US,],
        },
        {
            name: "Google",
            type: "fallback",
            proxies: [...gz_SG, ...SG, ...TW, ...JP, ...US, ...xs_EU, ...xs_JP,],
        },
        {
            name: "Gemini",
            type: "fallback",
            proxies: [...gz_SG, ...SG, ...TW, ...JP, ...US, ...xs_EU, ...xs_JP,],
        },
        {
            name: "ChatGPT",
            type: "fallback",
            proxies: [...gz_SG, ...TW, ...SG, ...JP, ...US, ...xs_US],
        },
        {
            name: "X",
            type: "fallback",
            proxies: [...xs_US, ...US, ...HK, ...JP, ...SG, ...TW],
        },
        {
            name: "TikTok",
            type: "fallback",
            proxies: [...xs_US, ...US, ...TW, ...JP, ...SG, ...HK],
        },
        {
            name: "Telegram",
            type: "url-test",
            proxies: [...gz_SG, ...gz_JP, ...gz_KR, ...gz_DE, ...SG, ...JP, ...TW, ...US, ...HK],
        },
        {
            name: "BBC",
            type: "url-test",
            proxies: [...xs_EU, ...xs_JP, ...gz_SG, ...gz_JP, ...gz_KR, ...gz_DE,],
        },
        {
            name: "Github",
            type: "fallback",
            proxies: [...gz_SG, ...gz_JP, ...gz_KR, ...gz_DE, ...HK, ...SG, ...JP, ...TW],
        },
    ].map((group) => ({
        ...group,
        proxies: group.proxies.length > 0
            ? group.proxies
            : [All.length > 0 ? "Auto" : "DIRECT"],
    }));

    const withTest = (group) => {
        const obj = {...group, url: testURL, interval: 300, timeout: 3000, lazy: true, "max-failed-times": 2,};
        if (group.type === "url-test") obj.tolerance = 20;
        return obj;
    };

    const allGroups = [autoGroup, ...serviceGroups];

    const validGroups = allGroups
        .filter((group) => group.proxies.length > 0)
        .map((group) => group.type === "select" ? group : withTest(group));

    const validGroupNames = new Set(validGroups.map((group) => group.name));
    const validNodeNames = new Set(All);

    const validDefaultGroup = {
        ...defaultGroup,
        proxies: [...defaultGroup.proxies.filter((name) =>
            name === "DIRECT" || validGroupNames.has(name) || validNodeNames.has(name)
        ), ...gz_SG],
    };

    return [validDefaultGroup, ...validGroups];
}

function addExternalNodes() {
    return [
        //xueshan
        {"name": "🇯🇵日本·三网|软银1", "type": "vless", "server": "x-rb6.xueshan168.cc", "port": 16000, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "5UyrbL7pqfhh7vgpyk5beDFZUK2uQWLqdvfgJBzu7Gg", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},
        {"name": "🇯🇵日本·三网|软银2", "type": "vless", "server": "x-rb6.xueshan168.cc", "port": 16000, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "5UyrbL7pqfhh7vgpyk5beDFZUK2uQWLqdvfgJBzu7Gg", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},
        {"name": "🇯🇵日本·三网|软银3", "type": "vless", "server": "x-rb7.xueshan168.cc", "port": 16000, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "5UyrbL7pqfhh7vgpyk5beDFZUK2uQWLqdvfgJBzu7Gg", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},
        {"name": "🇯🇵日本·三网|软银4", "type": "vless", "server": "x-rb7.xueshan168.cc", "port": 16000, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "5UyrbL7pqfhh7vgpyk5beDFZUK2uQWLqdvfgJBzu7Gg", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},
        {"name": "🇩🇪德国|法兰克福-1", "server": "x-dg.xueshan168.cc", "port": 20601, "sni": "x-dg.xueshan168.cc", "up": 1000, "down": 1000, "skip-cert-verify": true, "type": "hysteria2", "password": "a7e4ca22-2d00-4528-be77-a3f7ec205d63"},
        {"name": "🇩🇪德国|法兰克福-2", "type": "vless", "server": "x-dg.xueshan168.cc", "port": 443, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "cMB0tAmD6scVvjRbLVm1IjryKtXM6SDtceLiz_qF6iw", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},
        {"name": "🇫🇷法国|巴黎世家-1", "server": "x-fg.xueshan168.cc", "port": 20601, "sni": "x-fg.xueshan168.cc", "up": 1000, "down": 1000, "skip-cert-verify": true, "type": "hysteria2", "password": "a7e4ca22-2d00-4528-be77-a3f7ec205d63"},
        {"name": "🇫🇷法国|巴黎世家-2", "type": "vless", "server": "x-fg.xueshan168.cc", "port": 443, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "cMB0tAmD6scVvjRbLVm1IjryKtXM6SDtceLiz_qF6iw", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},
        {"name": "🇳🇱荷兰|阿姆斯特丹2", "type": "vless", "server": "hl.xueshan168.cc", "port": 443, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "cMB0tAmD6scVvjRbLVm1IjryKtXM6SDtceLiz_qF6iw", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},
        {"name": "🇺🇸美·洛杉矶|专线-DS2", "type": "vless", "server": "x-mg.xueshan168.cc", "port": 443, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "5UyrbL7pqfhh7vgpyk5beDFZUK2uQWLqdvfgJBzu7Gg", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},
        {"name": "🇺🇸美·盐湖城|专线-DS1", "server": "mg1.xueshan168.cc", "port": 20601, "sni": "mg1.xueshan168.cc", "up": 5000, "down": 5000, "skip-cert-verify": true, "type": "hysteria2", "password": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "obfs": "salamander", "obfs-password": "fmW0oAsJz1qFJ0Ez"},
        {"name": "🇺🇸美·盐湖城|专线-DS2", "type": "vless", "server": "mg1.xueshan168.cc", "port": 443, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "5UyrbL7pqfhh7vgpyk5beDFZUK2uQWLqdvfgJBzu7Gg", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},
        {"name": "🇺🇸美·凤凰城|专线-BP1", "server": "mg00.xueshan168.cc", "port": 20601, "sni": "mg00.xueshan168.cc", "up": 5000, "down": 5000, "skip-cert-verify": true, "type": "hysteria2", "password": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "obfs": "salamander", "obfs-password": "fmW0oAsJz1qFJ0Ez"},
        {"name": "🇺🇸美·凤凰城|专线-BP2", "type": "vless", "server": "mg00.xueshan168.cc", "port": 443, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "AKgKoK7kZCYcME_By_coqjGk-eWn6c4awdaqHYRak1o", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},
        {"name": "🇺🇸美·凤凰城|专线-BP3", "server": "mg-02.xueshan168.cc", "port": 20601, "sni": "mg-02.xueshan168.cc", "up": 5000, "down": 5000, "skip-cert-verify": true, "type": "hysteria2", "password": "a7e4ca22-2d00-4528-be77-a3f7ec205d63"},
        {"name": "🇺🇸美·凤凰城|专线-BP4", "type": "vless", "server": "mg-02.xueshan168.cc", "port": 16000, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "kcrzX4u2aXAvpUUnrx1ATqMJ_-6byfTI9DSl4pSFDmU", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},
        {"name": "🇺🇸美·凤凰城|专线-BP5", "server": "mg03.xueshan168.cc", "port": 20601, "sni": "mg03.xueshan168.cc", "up": 5000, "down": 5000, "skip-cert-verify": true, "type": "hysteria2", "password": "a7e4ca22-2d00-4528-be77-a3f7ec205d63"},
        {"name": "🇺🇸美·凤凰城|专线-BP6", "type": "vless", "server": "mg03.xueshan168.cc", "port": 16000, "uuid": "a7e4ca22-2d00-4528-be77-a3f7ec205d63", "alterId": 0, "cipher": "auto", "udp": true, "flow": "xtls-rprx-vision", "encryption": "none", "tls": true, "skip-cert-verify": false, "servername": "s0.awsstatic.com", "reality-opts": {"public-key": "iv3BAoFjlsPSSjOn1cyXVZ3H31KqX65PoJusBEfU0lM", "short-id": null}, "client-fingerprint": "chrome", "network": "tcp"},

        //gouzi
        {"name": "🇸🇬新加坡-限免01", "server": "sg-gcp.xn--9kqp42aims.top", "port": 20000, "ports": "20000-55000", "mport": "20000-55000", "udp": true, "skip-cert-verify": false, "sni": "sg-gcp.xn--9kqp42aims.top", "type": "hysteria2", "password": "6a67bb79-050a-4e26-a37b-7fd54a29e27e", "obfs": "salamander", "obfs-password": "OTA2ZjRiOGQ5MWYxNmQyZA=="},
        {"name": "🇰🇷韩国-01 | 家宽", "server": "kr-01.xn--9kqp42aims.top", "port": 65503, "udp": true, "skip-cert-verify": false, "sni": "kr-01.xn--9kqp42aims.top", "type": "hysteria2", "password": "6a67bb79-050a-4e26-a37b-7fd54a29e27e", "obfs": "salamander", "obfs-password": "OTA2ZjRiOGQ5MWYxNmQyZA=="},
        {"name": "🇰🇷韩国-02 | 家宽", "server": "kr-01.xn--9kqp42aims.top", "port": 65503, "udp": true, "skip-cert-verify": false, "sni": "kr-01.xn--9kqp42aims.top", "type": "hysteria2", "password": "6a67bb79-050a-4e26-a37b-7fd54a29e27e", "obfs": "salamander", "obfs-password": "OTA2ZjRiOGQ5MWYxNmQyZA=="},
        {"name": "🇩🇪德国-01", "type": "vless", "server": "de-01.xn--9kqp42aims.top", "port": 443, "uuid": "6a67bb79-050a-4e26-a37b-7fd54a29e27e", "udp": true, "flow": "xtls-rprx-vision", "tls": true, "skip-cert-verify": false, "client-fingerprint": "ios", "servername": "osxapps.itunes.apple.com", "reality-opts": {"public-key": "fyEP9fBnjiwjwBhzkqPvP9J8pwaOh_qK2hs_ddv7M14", "short-id": "99dd20b2", "support-x25519mlkem768": true}},
        {"name": "🇩🇪德国-02", "type": "vless", "server": "de-01.xn--9kqp42aims.top", "port": 443, "uuid": "6a67bb79-050a-4e26-a37b-7fd54a29e27e", "udp": true, "flow": "xtls-rprx-vision", "tls": true, "skip-cert-verify": false, "client-fingerprint": "ios", "servername": "osxapps.itunes.apple.com", "reality-opts": {"public-key": "fyEP9fBnjiwjwBhzkqPvP9J8pwaOh_qK2hs_ddv7M14", "short-id": "99dd20b2", "support-x25519mlkem768": true}},
        {"name": "🇯🇵日本-03", "type": "vless", "server": "jpsb01.xn--9kqp42aims.top", "port": 443, "uuid": "6a67bb79-050a-4e26-a37b-7fd54a29e27e", "udp": true, "flow": "xtls-rprx-vision", "tls": true, "skip-cert-verify": false, "client-fingerprint": "ios", "servername": "osxapps.itunes.apple.com", "reality-opts": {"public-key": "31eALXuX1vjl8-4MDwAyrpuZx1wrTr_qBA1gG15IkE8", "short-id": "7f2940ff", "support-x25519mlkem768": true}},
        {"name": "🇯🇵日本-04", "type": "vless", "server": "jpsb02.xn--9kqp42aims.top", "port": 443, "uuid": "6a67bb79-050a-4e26-a37b-7fd54a29e27e", "udp": true, "flow": "xtls-rprx-vision", "tls": true, "skip-cert-verify": false, "client-fingerprint": "ios", "servername": "osxapps.itunes.apple.com", "reality-opts": {"public-key": "T9pcrWuHZSRwYA0X4-doaLelgexCT8UEslkbQXEKaXc", "short-id": "d92e6172", "support-x25519mlkem768": true}},
        {"name": "🇯🇵日本-05", "type": "vless", "server": "jpsb03.xn--9kqp42aims.top", "port": 443, "uuid": "6a67bb79-050a-4e26-a37b-7fd54a29e27e", "udp": true, "flow": "xtls-rprx-vision", "tls": true, "skip-cert-verify": false, "client-fingerprint": "ios", "servername": "osxapps.itunes.apple.com", "reality-opts": {"public-key": "nxRLsmUNVvP8Vzmt19f_w1PeJ-9_iG_pHecDWxW8DxU", "short-id": "60eebf51", "support-x25519mlkem768": true}},
        {"name": "🇯🇵日本-06", "server": "jpyh.xn--9kqp42aims.top", "port": 20000, "ports": "20000-55000", "mport": "20000-55000", "udp": true, "skip-cert-verify": true, "sni": "gw.alicdn.com", "type": "hysteria2", "password": "6a67bb79-050a-4e26-a37b-7fd54a29e27e", "obfs": "salamander", "obfs-password": "OTA7ZjRiOGQ5MWYxNmQyZA=="},
    ];
}

function getRules() {
    return [
        // YouTube / 沉浸式翻译
        "DOMAIN-SUFFIX,googlevideo.com,YouTube",
        "DOMAIN-SUFFIX,ggpht.com,YouTube",
        "DOMAIN-SUFFIX,ytimg.com,YouTube",
        "DOMAIN-KEYWORD,youtube,YouTube",
        "DOMAIN-SUFFIX,immersivetranslate.com,YouTube",

        // AI
        "DOMAIN-KEYWORD,chatgpt,ChatGPT",
        "DOMAIN-KEYWORD,openai,ChatGPT",
        "DOMAIN-SUFFIX,oaistatic.com,ChatGPT",
        "DOMAIN-SUFFIX,oaiusercontent.com,ChatGPT",
        "DOMAIN-SUFFIX,gemini.google.com,Gemini",
        "DOMAIN-KEYWORD,gemini,Gemini",

        // Google
        "DOMAIN-SUFFIX,services.googleapis.cn,Google",
        "DOMAIN-SUFFIX,gstatic.com,Google",
        "DOMAIN-KEYWORD,google,Google",
        "DOMAIN-KEYWORD,gmail,Google",

        // 海外服务
        "DOMAIN-KEYWORD,tiktok,TikTok",
        "DOMAIN-SUFFIX,chinadigitaltimes.net,Google",
        "DOMAIN-KEYWORD,github,Github",
        "DOMAIN-SUFFIX,bbc.com,BBC",
        "DOMAIN-SUFFIX,bbc.co.uk,BBC",
        "DOMAIN-SUFFIX,x.com,X",
        "DOMAIN-SUFFIX,twitter.com,X",
        "DOMAIN-SUFFIX,twimg.com,X",
        "DOMAIN-SUFFIX,t.co,X",

        // Telegram
        "DOMAIN-SUFFIX,telegram.org,Telegram",
        "DOMAIN-SUFFIX,telegram.me,Telegram",
        "DOMAIN-SUFFIX,t.me,Telegram",
        "IP-CIDR,91.108.0.0/16,Telegram,no-resolve",
        "IP-CIDR,109.239.140.0/24,Telegram,no-resolve",
        "IP-CIDR,149.154.160.0/20,Telegram,no-resolve",
        "IP-CIDR6,2001:67c:4e8::/48,Telegram,no-resolve",
        "IP-CIDR6,2001:b28:f23d::/48,Telegram,no-resolve",
        "IP-CIDR6,2001:b28:f23f::/48,Telegram,no-resolve",

        //Google 中国服务相关 IP
        "IP-CIDR,120.232.181.162/32,Google,no-resolve",
        "IP-CIDR,120.241.147.226/32,Google,no-resolve",
        "IP-CIDR,120.253.253.226/32,Google,no-resolve",
        "IP-CIDR,120.253.255.162/32,Google,no-resolve",
        "IP-CIDR,120.253.255.34/32,Google,no-resolve",
        "IP-CIDR,120.253.255.98/32,Google,no-resolve",
        "IP-CIDR,180.163.150.162/32,Google,no-resolve",
        "IP-CIDR,180.163.150.34/32,Google,no-resolve",
        "IP-CIDR,180.163.151.162/32,Google,no-resolve",
        "IP-CIDR,180.163.151.34/32,Google,no-resolve",
        "IP-CIDR,203.208.39.0/24,Google,no-resolve",
        "IP-CIDR,203.208.40.0/24,Google,no-resolve",
        "IP-CIDR,203.208.41.0/24,Google,no-resolve",
        "IP-CIDR,203.208.43.0/24,Google,no-resolve",
        "IP-CIDR,203.208.50.0/24,Google,no-resolve",
        "IP-CIDR,220.181.174.162/32,Google,no-resolve",
        "IP-CIDR,220.181.174.226/32,Google,no-resolve",
        "IP-CIDR,220.181.174.34/32,Google,no-resolve",

        // Adobe
        "DOMAIN-SUFFIX,adobe.com,REJECT",
        "DOMAIN-SUFFIX,adobe.io,REJECT",
        "DOMAIN-SUFFIX,adobestats.io,REJECT",

        // 国内直连
        "DOMAIN-SUFFIX,acfun.tv,DIRECT",
        "DOMAIN-SUFFIX,aliapp.org,DIRECT",
        "DOMAIN-KEYWORD,alicdn,DIRECT",
        "DOMAIN-KEYWORD,alipay,DIRECT",
        "DOMAIN-SUFFIX,amap.com,DIRECT",
        "DOMAIN-SUFFIX,apple.com,DIRECT",
        "DOMAIN-KEYWORD,baidu,DIRECT",
        "DOMAIN-SUFFIX,baidu.com,DIRECT",
        "DOMAIN-SUFFIX,biligame.com,DIRECT",
        "DOMAIN-KEYWORD,bilibili,DIRECT",
        "DOMAIN-SUFFIX,bing.com,DIRECT",
        "DOMAIN-SUFFIX,douban.com,DIRECT",
        "DOMAIN-SUFFIX,douyin.com,DIRECT",
        "DOMAIN-SUFFIX,epubit.com,DIRECT",
        "DOMAIN-SUFFIX,jd.com,DIRECT",
        "DOMAIN-SUFFIX,kimi.com,DIRECT",
        "DOMAIN-SUFFIX,mi.com,DIRECT",
        "DOMAIN-SUFFIX,miui.com,DIRECT",
        'DOMAIN-SUFFIX,tmall.com,DIRECT',
        'DOMAIN-SUFFIX,miwifi.com,DIRECT',
        'DOMAIN-SUFFIX,sohu.com,DIRECT',
        "DOMAIN-SUFFIX,msn.com,DIRECT",
        "DOMAIN-SUFFIX,netease.com,DIRECT",
        "DOMAIN-SUFFIX,qq.com,DIRECT",
        'DOMAIN-SUFFIX,jianshu.com,DIRECT',
        'DOMAIN-SUFFIX,iqiyi.com,DIRECT',
        "DOMAIN-SUFFIX,qianwen.com,DIRECT",
        "DOMAIN-SUFFIX,360.com,DIRECT",
        "DOMAIN-SUFFIX,sogou.com,DIRECT",
        "DOMAIN-SUFFIX,sohu.com,DIRECT",
        "DOMAIN-SUFFIX,taobao.com,DIRECT",
        "DOMAIN-SUFFIX,tencent.com,DIRECT",
        "DOMAIN-SUFFIX,weibo.com,DIRECT",
        "DOMAIN-SUFFIX,weixin.com,DIRECT",
        "DOMAIN-SUFFIX,xunlei.com,DIRECT",
        "DOMAIN-SUFFIX,youdao.com,DIRECT",
        "DOMAIN-SUFFIX,youku.com,DIRECT",
        "DOMAIN-SUFFIX,zhihu.com,DIRECT",
        "DOMAIN-SUFFIX,126.com,DIRECT",
        "DOMAIN-SUFFIX,126.net,DIRECT",
        "DOMAIN-SUFFIX,127.net,DIRECT",
        "DOMAIN-SUFFIX,163.com,DIRECT",


        // 局域网 / 特殊地址
        "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
        "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
        "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
        "IP-CIDR,224.0.0.0/4,DIRECT,no-resolve",
        "IP-CIDR6,::1/128,DIRECT,no-resolve",
        "IP-CIDR6,fc00::/7,DIRECT,no-resolve",
        "IP-CIDR6,fe80::/10,DIRECT,no-resolve",
        "DOMAIN-SUFFIX,local,DIRECT",
        "GEOIP,LAN,DIRECT,no-resolve",

        // 中国流量
        "DOMAIN-SUFFIX,cn,DIRECT",
        "GEOSITE,CN,DIRECT",
        "GEOIP,CN,DIRECT,no-resolve",
    ];
}



