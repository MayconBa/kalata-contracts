const {toUnitString} = require("../utils/maths");

module.exports = {
    mainnet: {
        enableWBNB: false,
        kalaPrice: 0.27,
        assets: {
            "kCOIN": {
                name: "Wrapped Kalata COIN Token",
                symbol: "kCOIN",
                type: "stock",
                sinaCode: "gb_coin",
                gtimgCode: "usCOIN",
                chinlinkFeeder: '0x2d1AB79D059e21aE519d88F978cAF39d74E31AEB',
                weight: toUnitString(1),
            },
        },

        //每个Asset的挖矿权重
        assetWeights: {
            KALA: toUnitString(20),
            BUSD: toUnitString(1),
        },

        //KALA的释放计划
        distributeSchedule: [
            {start: 0, end: 14 * 3600 * 24, amount: toUnitString("3068493.15")}
        ],

        //奖励需要相同数量的KALA-BUSD抵押72小时才能解锁
        //BSC每隔3秒出一个区块
        //0.000011574074074074073
        busdPoolRewardUnlockSpeed: toUnitString((1.0 / (72.0 * 3600 / 3)).toFixed(18)),

        //KALA-BUSD双币挖矿的奖励解锁时间
        kalaBusdPoolClaimInterval: 3600 * 72,

        //Mint的手续费收集地址
        mintCollector: '0xE256F3eb0561ff1002Fd5E3a8b6609590fB63d14',

        //仓位低于最低抵押比率(150%)时,会进行清算,清算者享受的折扣是多少?
        mintAuctionDiscount: toUnitString("0.2"),

        minCollateralRatio: toUnitString("1.5")
    },
    rinkeby: {
        enableWBNB: false,
        kalaPrice: 0.27,
        assets: {
            "kCOIN": {
                name: "Wrapped Kalata COIN Token",
                symbol: "kCOIN",
                type: "stock",
                sinaCode: "gb_coin",
                gtimgCode: "usCOIN",
                chinlinkFeeder: '0x2d1AB79D059e21aE519d88F978cAF39d74E31AEB',
                weight: 0,
            },
        },

        //每个Asset的挖矿权重
        assetWeights: {
            KALA: toUnitString(20),
            BUSD: 0,
        },

        //KALA的释放计划
        distributeSchedule: [
            {start: 0, end: 14 * 3600 * 24, amount: toUnitString("3068493.15")}
        ],

        //奖励需要相同数量的KALA-BUSD抵押72小时才能解锁
        //BSC每隔3秒出一个区块
        //0.000011574074074074073
        busdPoolRewardUnlockSpeed: toUnitString((1.0 / (72.0 * 3600 / 3)).toFixed(18)),

        //KALA-BUSD双币挖矿的奖励解锁时间
        kalaBusdPoolClaimInterval: 3600 * 72,

        //Mint的手续费收集地址
        mintCollector: '0x5e55Ac8943D7DDb05399568c64C257DbF0c977E4',

        //仓位低于最低抵押比率(150%)时,会进行清算,清算者享受的折扣是多少?
        mintAuctionDiscount: toUnitString("0.2"),

        minCollateralRatio: toUnitString("1.5")
    },
    testnet: {
        enableWBNB: false,
        kalaPrice: 0.27,
        assets: {
            "kCOIN": {
                name: "Wrapped Kalata COIN Token",
                symbol: "kCOIN",
                type: "stock",
                sinaCode: "gb_coin",
                gtimgCode: "usCOIN",
                weight: 0,
            },
        },

        //每个Asset的挖矿权重
        assetWeights: {
            KALA: toUnitString(20),
            BUSD: 0,
        },

        //KALA的释放计划
        distributeSchedule: [
            {start: 0, end: 14 * 3600 * 24, amount: toUnitString("3068493.15")}
        ],

        //奖励需要相同数量的KALA-BUSD抵押72小时才能解锁
        //BSC每隔3秒出一个区块
        //0.000011574074074074073
        busdPoolRewardUnlockSpeed: toUnitString((1.0 / (72.0 * 3600 / 3)).toFixed(18)),

        //KALA-BUSD双币挖矿的奖励解锁时间
        kalaBusdPoolClaimInterval: 3600 * 72,

        //Mint的手续费收集地址
        mintCollector: '0xE256F3eb0561ff1002Fd5E3a8b6609590fB63d14',

        //仓位低于最低抵押比率(150%)时,会进行清算,清算者享受的折扣是多少?
        mintAuctionDiscount: toUnitString("0.2"),

        minCollateralRatio: toUnitString("1.5")
    }
}


// "kBIDU": {
//     name: "Wrapped Kalata BIDU Token",
//     symbol: "kBIDU",
//     type: "stock",
//     sinaCode: "gb_bidu",
//     gtimgCode: "usBIDU",
//     weight: 0,
//
// },
//
// "kTSLA": {
//     name: "Wrapped Kalata TSLA Token",
//     symbol: "kTSLA",
//     type: "stock",
//     sinaCode: "gb_tsla",
//     gtimgCode: "usTSLA",
//     weight: 0,
// },
// "kARKK": {
//     name: "Wrapped Kalata ARKK Token",
//     symbol: "kARKK",
//     type: "stock",
//     sinaCode: "gb_arkk",
//     gtimgCode: "usARKK",
//     weight: 0,
// },
// "kSPCE": {
//     name: "Wrapped Kalata SPCE Token",
//     symbol: "kSPCE",
//     type: "stock",
//     sinaCode: "gb_spce",
//     gtimgCode: "usSPCE",
//     weight: 0,
// },
// "kPACB": {
//     name: "Wrapped Kalata PACB Token",
//     symbol: "kPACB",
//     type: "stock",
//     sinaCode: "gb_pacb",
//     gtimgCode: "usPACB",
//     weight: 0,
// },
