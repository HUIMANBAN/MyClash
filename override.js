// noinspection SpellCheckingInspection

/*
 * 基于 1.js 的通用 JS 覆写，供 Clash / Mihomo 客户端调用 main(config)。
 * 将本文件完整粘贴到脚本覆写中，分别应用于三个订阅即可；不合并订阅。
 * 只替换节点列表、代理组和规则，保留 DNS、端口、节点协议参数等设置。
 *
 * - 过滤订阅提示，支持国旗、中英文地区名及地区缩写。
 * - 缺少某个地区时使用其他普通节点，所有服务策略组始终存在。
 * - High Group 保留手动选择；有普通节点时不自动使用高倍率/专线节点。
 * - 明确标注 0.1 倍、1x 等不超过 1 倍的节点仍按地区分类。
 */

const testURL = "https://www.gstatic.com/generate_204";
const regionOrder = ["TW", "JP", "SG", "US", "HK", "KR", "UK", "Other"];
const regionRegex = {
    HK: /🇭🇰|香港|Hong\s*Kong|(?:^|[^a-z])HK(?=\d|[^a-z]|$)/i,
    TW: /🇹🇼|台湾|台北|Taiwan|Taipei|(?:^|[^a-z])TW(?=\d|[^a-z]|$)/i,
    JP: /🇯🇵|日本|东京|大阪|Japan|Tokyo|Osaka|(?:^|[^a-z])JP(?=\d|[^a-z]|$)/i,
    KR: /🇰🇷|韩国|首尔|Korea|Seoul|(?:^|[^a-z])KR(?=\d|[^a-z]|$)/i,
    SG: /🇸🇬|新加坡|狮城|Singapore|(?:^|[^a-z])SG(?=\d|[^a-z]|$)/i,
    US: /🇺🇸|美国|洛杉矶|凤凰城|圣何塞|United\s*States|Los\s*Angeles|San\s*Jose|(?:^|[^a-z])USA?(?=\d|[^a-z]|$)/i,
    UK: /🇬🇧|英国|伦敦|United\s*Kingdom|Britain|London|(?:^|[^a-z])(?:UK|GB)(?=\d|[^a-z]|$)/i,
};

// 保留原脚本的“试验 / 更新”过滤，补充三个订阅里的公告和套餐信息。
const excludedNodeRegex =
    /试验|更新|剩余流量|套餐到期|到期时间|流量重置|重置时间|有超时请|重启网络|官网地址|订阅地址/i;

function main(config) {
    if (!config || !Array.isArray(config.proxies)) {
        throw new Error("通用覆写：配置中没有 proxies 节点列表，请使用包含节点的订阅。");
    }

    const seen = new Set();
    const proxies = config.proxies.filter((proxy) => {
        if (!proxy || typeof proxy.name !== "string" || !proxy.name.trim()) {
            return false;
        }
        if (excludedNodeRegex.test(proxy.name) || seen.has(proxy.name)) {
            return false;
        }
        seen.add(proxy.name);
        return true;
    });

    if (!proxies.length) {
        throw new Error("通用覆写：过滤后没有可用节点，请检查订阅或 excludedNodeRegex。");
    }

    const nodes = { High: [] };
    for (const region of regionOrder) nodes[region] = [];

    for (const proxy of proxies) {
        if (isHighRateNode(proxy.name)) {
            nodes.High.push(proxy.name);
            continue;
        }
        const region = Object.keys(regionRegex).find((key) =>
            regionRegex[key].test(proxy.name)
        );
        nodes[region || "Other"].push(proxy.name);
    }

    const groups = createProxyGroups(nodes);
    const groupNames = new Set(groups.map((group) => group.name));
    if (proxies.some((proxy) => groupNames.has(proxy.name))) {
        throw new Error("通用覆写：节点与策略组重名，请重命名同名节点或策略组。");
    }

    config.proxies = proxies;
    config["proxy-groups"] = groups;
    config.rules = [...getRules(), "MATCH,Default"];
    return config;
}

function isHighRateNode(name) {
    // 先解析完整数字，避免将 0.1x 的末尾 1x、0.01倍等误判为高倍率。
    const rates = name.match(/\d+(?:\.\d+)?\s*(?:x|×|倍)/gi);
    if (rates) return rates.some((rate) => parseFloat(rate) > 1);
    // 没写倍率的专线沿用 1.js 的手动分组方式。
    return /专线|專線/i.test(name);
}

function unique(names) {
    return [...new Set(names)];
}

function withTest(group) {
    const result = {
        ...group,
        url: testURL,
        interval: 300,
        timeout: 3000,
        lazy: true,
        "max-failed-times": 2,
    };
    if (group.type === "url-test") result.tolerance = 20;
    return result;
}

function createProxyGroups(nodes) {
    const normalNodes = regionOrder.flatMap((region) => nodes[region]);
    // 仅剩高倍率/专线时仍可使用；不偷偷将代理流量改为直连。
    const fallbackNodes = normalNodes.length ? normalNodes : nodes.High;
    const candidates = (preferredRegions) => unique([
        ...preferredRegions.flatMap((region) => nodes[region]),
        ...fallbackNodes,
    ]);

    const groups = [
        withTest({ name: "Auto", type: "fallback", proxies: candidates(regionOrder) }),
    ];

    // 保留原脚本的首选地区顺序，最后补上其余普通节点以兼容地区缺失。
    const services = [
        ["YouTube", "url-test", ["TW", "SG", "JP", "HK"]],
        ["Google", "url-test", ["US", "TW", "SG", "JP", "KR", "HK"]],
        ["Gemini", "fallback", ["HK", "TW", "JP", "US", "KR", "SG"]],
        ["ChatGPT", "fallback", ["TW", "SG", "JP", "US"]],
        ["X", "fallback", ["US", "HK", "JP", "SG", "TW"]],
        ["TikTok", "fallback", ["US", "TW", "JP", "SG", "HK"]],
        ["Telegram", "url-test", ["SG", "JP", "TW", "US", "HK"]],
        ["BBC", "fallback", ["HK", "SG", "JP", "UK", "KR", "Other"]],
    ];
    for (const [name, type, regions] of services) {
        groups.push(withTest({ name, type, proxies: candidates(regions) }));
    }

    const regionPreferences = {
        HK: ["HK", "TW", "JP", "SG", "US"],
        TW: ["TW", "JP", "SG", "US", "HK"],
        JP: ["JP", "SG", "TW", "US", "HK"],
        SG: ["SG", "JP", "TW", "US", "HK"],
        US: ["US", "TW", "JP", "SG", "HK"],
        KR: ["KR", "HK", "TW", "JP", "SG", "US"],
        UK: ["UK", "US", "JP", "SG", "HK"],
    };
    for (const region of Object.keys(regionPreferences)) {
        if (nodes[region].length) {
            groups.push(withTest({
                name: `${region} Group`,
                type: "fallback",
                proxies: candidates(regionPreferences[region]),
            }));
        }
    }
    if (nodes.Other.length) {
        groups.push(withTest({
            name: "Other Group",
            type: "url-test",
            proxies: nodes.Other,
        }));
    }
    if (nodes.High.length) {
        groups.push({ name: "High Group", type: "select", proxies: nodes.High });
    }

    const available = new Set(groups.map((group) => group.name));
    const defaultChoices = [
        "Auto", "HK Group", "TW Group", "JP Group", "SG Group",
        "US Group", "KR Group", "UK Group", "Other Group", "High Group",
    ];
    return [
        {
            name: "Default",
            type: "select",
            proxies: defaultChoices.filter((name) => available.has(name)),
        },
        ...groups,
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
