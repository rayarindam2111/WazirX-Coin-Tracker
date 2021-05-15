var chart = null;

var showChart = async function (containerID, completed, buySellArray, coin, interval = '1d') {
    try {
        await showChartMain(containerID, completed, buySellArray, coin, interval);
    }
    catch (err) {
        completed(false);
    }
}

var showChartMain = async function (containerID, completed, buySellInfo, coin, interval = '1d') {
    chart && chart.dispose();
    document.getElementById(containerID).innerHTML = '';

    let buySellArray = buySellInfo.slice();

    var countDecimals = function (value) {
        if (Math.floor(value) === value) return 0;
        return value.toString().split(".")[1].length || 0;
    }

    var roundoff = function (number, decimaldigits) {
        let power = Math.pow(10, decimaldigits);
        return Math.round(number * power) / power;
    }

    let curYear = new Date().getFullYear();
    let getTimeInt = function (str) {
        return new Date(`${curYear} ${str}`).getTime();
    }

    buySellArray.sort((first, second) => {
        let datefirst = getTimeInt(first.date);
        let datesecond = getTimeInt(second.date);
        if (datefirst > datesecond) return 1;
        if (datefirst < datesecond) return -1;
        return 0;
    });

    let starttime = getTimeInt(buySellArray[0].date) - 86500000; //get 1 day previous date from first date
    let endtime = Date.now();

    let fetchData = {};
    let candleData = {};
    try {
        fetchData = await fetch(
            `https://api-v2.bitscreener.com/api/v3/graphs/ohlc/exchange_pair?from=${starttime}&to=${endtime}&interval=${interval}`,
            {
                "headers": {
                    "accept": "application/json, text/plain, */*",
                    "content-type": "application/json;charset=UTF-8",
                },
                "body": "{\"exchange\":\"WazirX\",\"pair\":\"" + coin + "\"}",
                "method": "POST"
            });
        candleData = await fetchData.json();
    } catch (err) {
        throw (err);
    }

    let fdata = '';
    let buyLog = '';
    let sellLog = '';
    let firstrun = true;
    let amtBought = 0;
    let totBuyP = 0;
    let amtSold = 0;
    let totSellP = 0;
    let perCoinPriceImprove = 0;
    let notEnoughData = false;

    if (buySellArray.length > 0 && getTimeInt(buySellArray[0].date) < candleData.ts[0]) {
        // not enough data;
        notEnoughData = true;
    }
    while (buySellArray.length > 0 && getTimeInt(buySellArray[0].date) < candleData.ts[0])
        buySellArray.splice(0, 1);

    for (let r = 0; r < candleData.ts.length; r++) {
        let date = new Date(candleData.ts[r]);
        let open = candleData.open[r];
        let high = candleData.high[r];
        let low = candleData.low[r];
        let close = candleData.close[r];
        let volume = candleData.vlm && candleData.vlm[r - 1] && candleData.vlm[r] > 5 * candleData.vlm[r - 1] ? (candleData.vlm[r - 1] + (candleData.vlm[r + 1] || 0)) / 2 : candleData.vlm[r];

        while (buySellArray.length > 0) {
            let firstDate = getTimeInt(buySellArray[0].date);

            if (firstDate >= candleData.ts[r] && (!candleData.ts[r + 1] || firstDate <= candleData.ts[r + 1])) {
                if (firstrun) firstrun = false;

                if (buySellArray[0].buy) {
                    totBuyP += (buySellArray[0].price * buySellArray[0].amount);
                    amtBought += buySellArray[0].amount;
                    let bPrice = buySellArray[0].price;
                    buyLog += (`"${date}","${bPrice}"\n`);
                }
                else {
                    totSellP += (buySellArray[0].price * buySellArray[0].amount);
                    amtSold += buySellArray[0].amount;
                    perCoinPriceImprove = (totSellP / amtSold) - (totBuyP / amtBought);
                    let sPrice = buySellArray[0].price;
                    sellLog += (`"${date}","${sPrice}"\n`);
                }
                buySellArray.splice(0, 1);
            }
            else {
                break;
            }
        }

        let moneyIfSellNow = close * (amtBought - amtSold);
        let recovery = close * (totSellP + moneyIfSellNow) / (totBuyP);

        let decimalPoints = countDecimals(close);
        let myperfRecov = '';

        let myperfPerCoin = firstrun ? '' : roundoff(close + perCoinPriceImprove, decimalPoints);
        if ((amtBought - amtSold) > 0 && (totSellP - totBuyP) < 0)
            myperfRecov = firstrun ? '' : roundoff(recovery, decimalPoints);

        fdata += (`"${date}","${open}","${high}","${low}","${close}","${myperfPerCoin}","${myperfRecov}","${volume}"\n`);
    }

    anychart.onDocumentReady(function () {
        let dataTable = anychart.data.table();
        dataTable.addData(fdata);
        mapping = dataTable.mapAs({ 'open': 1, 'high': 2, 'low': 3, 'close': 4 });
        mapping_line_close = dataTable.mapAs({ 'value': 4 });
        mapping_line_myperf_coin = dataTable.mapAs({ 'value': 5 });
        mapping_line_myperf_recov = dataTable.mapAs({ 'value': 6 });

        let buyTable = anychart.data.table();
        buyTable.addData(buyLog);
        let sellTable = anychart.data.table();
        sellTable.addData(sellLog);
        mapping_marker_bPrice = buyTable.mapAs({ 'value': 1 });
        mapping_marker_sPrice = sellTable.mapAs({ 'value': 1 });

        chart = anychart.stock();

        let series = chart.plot(0).candlestick(mapping);
        series.name(`Market`);
        series.fallingFill("#cc0000");
        series.fallingStroke("#dd0000");
        series.risingFill("#00aa00");
        series.risingStroke("#00bb00");

        let closing_line = chart.plot(0).line(mapping_line_close);
        closing_line.name("Closing");
        closing_line.stroke('#ec8b23');
        closing_line.zIndex(150);
        let perf_line_coin = chart.plot(0).line(mapping_line_myperf_coin);
        perf_line_coin.name("Performance");
        perf_line_coin.stroke("#0093ff");
        perf_line_coin.zIndex(170);
        let perf_line_recov = chart.plot(0).line(mapping_line_myperf_recov);
        perf_line_recov.name("Recovery");
        perf_line_recov.stroke("#552fc3");
        perf_line_recov.zIndex(190);

        let series_marker_buy = chart.plot(0).marker(mapping_marker_bPrice);
        series_marker_buy.name("Buy");
        series_marker_buy.normal().type("triangle-up");
        series_marker_buy.normal().size(8.2);
        series_marker_buy.normal().fill("#00cc44", 0.8);
        series_marker_buy.normal().stroke("#0048ff", 1.4);
        series_marker_buy.zIndex(200);

        let series_marker_sell = chart.plot(0).marker(mapping_marker_sPrice);
        series_marker_sell.name("Sell");
        series_marker_sell.normal().type("triangle-down");
        series_marker_sell.normal().size(8.2);
        series_marker_sell.normal().fill("#ff2a2a", 0.8);
        series_marker_sell.normal().stroke("#3a44ff", 1.4);
        series_marker_sell.zIndex(199);

        chart.scroller().xAxis(false);
        openValue = dataTable.mapAs({ 'value': 7 });
        chart.scroller().column(openValue);
        chart.scroller().fill("#6d55f9", 0.035).selectedFill("#dacaff", 0.2);;

        chart.title('');
        let title = chart.title();
        let titleText = `${coin} Historical Trade Data`;
        if (notEnoughData)
            titleText += "<br><span style='color:#FF0000;font-size: 10px;'>Enough data not available. Try increasing chart interval.</span>";
        title.useHtml(true);
        title.text(titleText);
        title.textSettings({ fontWeight: 'bold' })


        //chart.background().fill('#000',1);

        chart.container(containerID);

        chart.draw();

        completed(true);
    });
}