/*
 * =====================================================
 * 基础配置
 * =====================================================
 */

const countryRegex = {
    HK: /🇭🇰|香港/i,
    TW: /🇹🇼|台湾/i,
    JP: /🇯🇵|日本/i,
    KR: /🇰🇷|韩国/i,
    SG: /🇸🇬|新加坡/i,
    US: /🇺🇸|美国/i,
    UK: /🇬🇧|英国/i,
};

const countries = ["HK", "TW", "JP", "KR", "SG", "US", "UK", "Other"];

const testURLs = {
    Google: "https://www.gstatic.com/generate_204",
    Cloudflare: "https://cp.cloudflare.com/generate_204",
};

const testURL = testURLs.Google;

/*
 * =====================================================
 * 主函数
 * =====================================================
 */

const main = function (config) {
    // 删除不需要的节点
    config.proxies = config.proxies.filter(
        ({name}) => !/试验|更新/i.test(name)
    );

    // 节点分类
    const countryNodes = Object.fromEntries(
        countries.map((country) => [country, []])
    );
    const countryPatterns = Object.entries(countryRegex);

    for (const {name} of config.proxies) {
        const country =
            countryPatterns.find(([, regex]) => regex.test(name))?.[0] ??
            "Other";

        countryNodes[country].push(name);
    }

    // 创建代理组
    config["proxy-groups"] = createProxyGroups(countryNodes);

    // 添加分流规则
    config.rules = [...getRules(), "MATCH,Default"];

    return config;
};

/*
 * =====================================================
 * Proxy Groups
 * =====================================================
 */

function createProxyGroups(nodes) {
    const {HK, TW, JP, KR, SG, US, UK, Other} = nodes;

    // -----------------------------------------------------
    // 默认选择组
    // -----------------------------------------------------

    const defaultGroup = {
        name: "Default",
        type: "select",
        proxies: [
            "Auto",
            "HK Group",
            "TW Group",
            "JP Group",
            "SG Group",
            "US Group",
            "KR Group",
            "Other Group",
        ],
    };

    // -----------------------------------------------------
    // 总自动选择组
    // fallback：按顺序选择可用节点
    // -----------------------------------------------------

    const autoGroup = {
        name: "Auto",
        type: "fallback",
        proxies: [...TW, ...JP, ...SG, ...US, ...HK, ...KR, ...Other],
    };

    // -----------------------------------------------------
    // 服务策略组
    // -----------------------------------------------------

    const serviceGroups = [
        {
            name: "YouTube",
            type: "url-test",
            proxies: [...TW, ...SG, ...JP, ...HK],
        },
        {
            name: "Google",
            type: "url-test",
            proxies: [...US, ...TW, ...SG, ...JP, ...KR, ...HK],
        },
        {
            name: "Gemini",
            type: "fallback",
            proxies: [...HK, ...TW, ...JP, ...US, ...KR, ...SG],
        },
        {
            name: "ChatGPT",
            type: "fallback",
            proxies: [...TW, ...SG, ...JP, ...US],
        },
        {
            name: "X",
            type: "fallback",
            proxies: [...US, ...HK, ...JP, ...SG, ...TW],
        },
        {
            name: "TikTok",
            type: "fallback",
            proxies: [...US, ...TW, ...JP, ...SG, ...HK],
        },
        {
            name: "Telegram",
            type: "url-test",
            proxies: [...SG, ...JP, ...TW, ...US, ...HK],
        },
        {
            name: "BBC",
            type: "fallback",
            proxies: [...HK, ...SG, ...JP, ...UK, ...KR, ...Other],
        },
    ];

    // -----------------------------------------------------
    // 国家 / 地区策略组
    // 优先使用本地区节点，后续地区作为备用
    // -----------------------------------------------------

    const countryGroups = [
        {
            name: "US Group",
            type: "fallback",
            proxies: [...US, ...TW, ...JP, ...SG, ...HK],
        },
        {
            name: "JP Group",
            type: "fallback",
            proxies: [...JP, ...SG, ...TW, ...US, ...HK],
        },
        {
            name: "SG Group",
            type: "fallback",
            proxies: [...SG, ...JP, ...TW, ...US, ...HK],
        },
        {
            name: "TW Group",
            type: "fallback",
            proxies: [...TW, ...JP, ...SG, ...US, ...HK],
        },
        {
            name: "HK Group",
            type: "fallback",
            proxies: [...HK, ...TW, ...JP, ...SG, ...US],
        },
        {
            name: "KR Group",
            type: "fallback",
            proxies: [...KR, ...HK, ...TW, ...JP, ...SG, ...US],
        },
        {
            name: "Other Group",
            type: "url-test",
            proxies: Other,
        },
    ];

    // -----------------------------------------------------
    // 统一测速配置
    // -----------------------------------------------------

    const withTest = (group) => {
        const obj = {
            ...group,
            url: testURL,
            interval: 300,
            timeout: 3000,
            lazy: true,
            "max-failed-times": 2,
        };

        if (group.type === "url-test") {
            obj.tolerance = 20;
        }

        return obj;
    };

    // -----------------------------------------------------
    // 只生成有可用节点的组，避免空代理组
    // 同时过滤不存在的策略组引用
    // -----------------------------------------------------

    const allGroups = [autoGroup, ...serviceGroups, ...countryGroups];

    const validGroups = allGroups
        .filter((group) => group.proxies.length > 0)
        .map(withTest);

    const validGroupNames = new Set(validGroups.map((group) => group.name));

    const validDefaultGroup = {
        ...defaultGroup,
        proxies: defaultGroup.proxies.filter((name) =>
            validGroupNames.has(name)
        ),
    };

    return [validDefaultGroup, ...validGroups];
}

/*
 * =====================================================
 * Rules
 * =====================================================
 */

function getRules() {
    return [
        // YouTube / 沉浸式翻译
        "DOMAIN-SUFFIX,googlevideo.com,YouTube",
        "DOMAIN-SUFFIX,ggpht.com,YouTube",
        "DOMAIN-SUFFIX,ytimg.com,YouTube",
        "DOMAIN-KEYWORD,youtube,YouTube",
        "DOMAIN-SUFFIX,immersivetranslate.com,YouTube",

        // AI：具体服务在 Google 的通用规则之前。
        "DOMAIN-KEYWORD,chatgpt,ChatGPT",
        "DOMAIN-KEYWORD,openai,ChatGPT",
        "DOMAIN-SUFFIX,oaistatic.com,ChatGPT",
        "DOMAIN-SUFFIX,oaiusercontent.com,ChatGPT",
        "DOMAIN-SUFFIX,gemini.google.com,Gemini",
        "DOMAIN-KEYWORD,gemini,Gemini",

        // Google
        "DOMAIN-SUFFIX,gstatic.com,Google",
        "DOMAIN-KEYWORD,google,Google",

        // 海外服务：BBC 绑定已有的 BBC 服务组，不依赖台湾节点。
        "DOMAIN-KEYWORD,tiktok,TikTok",
        "DOMAIN-SUFFIX,chinadigitaltimes.net,Google",
        "DOMAIN-KEYWORD,github,Google",
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

        // Adobe：沿用 1.js 的拦截设置。
        "DOMAIN-SUFFIX,adobe.com,REJECT",
        "DOMAIN-SUFFIX,adobe.io,REJECT",
        "DOMAIN-SUFFIX,adobestats.io,REJECT",

        // 国内直连：沿用原有策略。
        "DOMAIN-SUFFIX,acfun.tv,DIRECT",
        "DOMAIN-SUFFIX,aliapp.org,DIRECT",
        "DOMAIN-KEYWORD,alicdn,DIRECT",
        "DOMAIN-KEYWORD,alipay,DIRECT",
        "DOMAIN-SUFFIX,amap.com,DIRECT",
        "DOMAIN-SUFFIX,apple.com,DIRECT",
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
        "DOMAIN-SUFFIX,msn.com,DIRECT",
        "DOMAIN-SUFFIX,netease.com,DIRECT",
        "DOMAIN-SUFFIX,qq.com,DIRECT",
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

        // 中国流量（使用客户端提供的 GeoSite / GeoIP 数据）。
        "DOMAIN-SUFFIX,cn,DIRECT",
        "GEOSITE,CN,DIRECT",
        "GEOIP,CN,DIRECT,no-resolve",
    ];
}