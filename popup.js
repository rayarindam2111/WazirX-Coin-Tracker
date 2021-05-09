document.addEventListener('DOMContentLoaded', function () {
	console.log("popup DOM fully loaded and parsed");

	setTimeout(function () {
		if (document.getElementById('statusText').innerHTML != 'Fetching data...')
			getTab();
	}, 600);

	var checkPageButton = document.getElementById('buttonRefreshData');
	checkPageButton.addEventListener('click', getTab);
}, false);

var getTab = function () {
	chrome.tabs.query({
		active: true,
		currentWindow: true
	}, function (tabs) {
		var tabId = tabs[0].id;
		console.log('tabID:', tabId);
		refreshData(tabId);
	});
}

var refreshData = function (tabId) {
	document.getElementById('buttonRefreshData').setAttribute("disabled", "");
	document.getElementById('noOfTransactions').setAttribute("disabled", "");
	document.getElementById('flexSwitchCheckChecked').setAttribute("disabled", "");
	document.getElementById('buttonRefreshData').classList.remove("btn-danger");
	document.getElementById('buttonRefreshData').classList.add("btn-success");
	document.getElementById('statusText').innerHTML = 'Fetching data...';
	document.querySelector('#buttonRefreshData>svg').classList.add('spinning');
	
	let limiter = document.getElementById('flexSwitchCheckChecked').checked;
	let maxTransactions = processNum(document.getElementById('noOfTransactions').value);
	if (maxTransactions === '-9999999') {
		document.getElementById('noOfTransactions').value = 30;
		maxTransactions = 30;
	}
	else {
		maxTransactions = Math.abs(Math.round(maxTransactions));
		document.getElementById('noOfTransactions').value = maxTransactions;
	}

	chrome.tabs.executeScript(tabId,
		{
			code: `(${modifyDOM})(${limiter},${maxTransactions});` 
		},
		async (emptyPromise) => {
			const message = new Promise((resolve) => {
				const listener = (request) => {
					chrome.runtime.onMessage.removeListener(listener);
					return resolve(request);
				};
				chrome.runtime.onMessage.addListener(listener);
			});

			const result = await message;
			console.log('obtained data:', result);

			document.querySelector('#buttonRefreshData>svg').classList.remove('spinning');
			if (result.errors) {
				console.log('error while scraping');
				document.getElementById('buttonRefreshData').classList.remove("btn-success");
				document.getElementById('buttonRefreshData').classList.add("btn-danger");
				document.getElementById('statusText').innerHTML = 'Refresh (Errors found)';
			}
			else {
				createMatrix(result);
				document.getElementById('buttonRefreshData').classList.remove("btn-danger");
				document.getElementById('buttonRefreshData').classList.add("btn-success");
				document.getElementById('statusText').innerHTML = 'Refresh';
			}

			document.getElementById('buttonRefreshData').removeAttribute("disabled", "");
			document.getElementById('noOfTransactions').removeAttribute("disabled", "");
			document.getElementById('flexSwitchCheckChecked').removeAttribute("disabled", "");
		});
}

var modifyDOM = async function (limiter, maxTransactions) {

	var getCount = function (parent, getChildrensChildren) {
		var relevantChildren = 0;
		var children = parent.childNodes.length;
		for (let i = 0; i < children; i++) {
			if (parent.childNodes[i].nodeType != 3) {
				if (getChildrensChildren)
					relevantChildren += getCount(parent.childNodes[i], true);
				relevantChildren++;
			}
		}
		return relevantChildren;
	}

	var clickOrders = function () {
		try {
			completedOrdersBtn = document.querySelector('#root>div>div:nth-last-child(1)>div>div:nth-of-type(3)>div:nth-of-type(3)>div:nth-of-type(1)>div:nth-of-type(2)');
			completedOrdersBtn.click();
			return 0;
		}
		catch {
			return -1;
		}
	}

	var getOrders = async function () {
		try {
			console.log('limiter:', limiter);
			console.log('maxTransactions', maxTransactions);

			let topOrderElemStr = '#root>div>div:nth-last-child(1)>div>div:nth-of-type(3)>div:nth-of-type(3)>div:nth-of-type(2)>div>div>div:nth-of-type(3)>div';
			let rootOrderElemStr = topOrderElemStr + '>div';
			let objDiv = document.querySelector(topOrderElemStr);

			let orderLength = getCount(document.querySelector(rootOrderElemStr), false);

			let retryOrders = true;
			while ((!limiter || orderLength <= maxTransactions) && (retryOrders)) {
				let flag = false;
				for (let i = 1; i <= orderLength; i++) {
					let orderElemStr = rootOrderElemStr + '>div:nth-of-type(' + i + ')';
					if (document.querySelector(orderElemStr).hasAttribute('height')) {
						flag = true;
						break;
					}
				}

				retryOrders = flag ? true : false;

				if (retryOrders) {
					console.log('Capturing more orders...');
					objDiv.scrollTop = objDiv.scrollHeight;
					await timeout(200);
					orderLength = getCount(document.querySelector(rootOrderElemStr), false);
				}
			}

			let data = [];
			for (let i = 1; i <= orderLength; i++) {
				if (limiter && i > maxTransactions)
					break;
				let orderElemStr = rootOrderElemStr + '>div:nth-of-type(' + i + ')';
				let coinTitle_1Str = orderElemStr + '>div:nth-of-type(1)>div:nth-of-type(1)>span>span:nth-of-type(1)';
				let coinTitle_2Str = orderElemStr + '>div:nth-of-type(1)>div:nth-of-type(1)>span>span:nth-of-type(2)';
				let coinValPurchasedStr = orderElemStr + '>div:nth-of-type(1)>div:nth-of-type(2)>span>span:nth-of-type(1)';
				let coinPriceStr = orderElemStr + '>div:nth-of-type(1)>div:nth-of-type(3)>span';

				let buySell = window.getComputedStyle(
					document.querySelector(orderElemStr), ':before'
				).getPropertyValue('background-color') == 'rgb(0, 200, 83)';

				let coinTitle = document.querySelector(coinTitle_1Str).innerHTML.trim().toLowerCase() + '/' + document.querySelector(coinTitle_2Str).innerHTML.trim().toLowerCase();
				let coinValPurchased = document.querySelector(coinValPurchasedStr).innerHTML;
				let coinPrice = document.querySelector(coinPriceStr).innerHTML;

				data.push({ coin: coinTitle, purchased: coinValPurchased, price: coinPrice, buy: buySell });
			}
			objDiv.scrollTop = 0;

			console.log('orders purchased: ', data);
			return data;
		}
		catch (err) {
			return -1;
		}
	}

	var clearFilters = function (updateValue) {
		try {
			let input = document.querySelector('#root>div>div:nth-last-child(1)>div>div:nth-of-type(1)>div>div:nth-of-type(1)>div:nth-of-type(2)>div>input');
			let lastValue = input.value;
			input.value = updateValue;
			let event = new Event('input', { bubbles: true });
			event.simulated = true;
			let tracker = input._valueTracker;
			if (tracker) {
				tracker.setValue(lastValue);
			}
			input.dispatchEvent(event);
			return lastValue;
		}
		catch {
			console.log('error clearing filter');
		}
	}

	var getBtnCurrency = function (baseCurrency) {
		try {
			var allColsBtnStr = '#root>div>div:nth-last-child(1)>div>div:nth-of-type(1)>div>div:nth-of-type(1)>div:nth-of-type(1)>div';
			var noOfCols = getCount(document.querySelector(allColsBtnStr), false);
			var columnNo = (noOfCols - 4) + (baseCurrency == 'inr' ? 1 : (baseCurrency == 'usdt' ? 2 : (baseCurrency == 'wrx' ? 3 : 4)));
			var colBtn = document.querySelector(allColsBtnStr + '>label:nth-of-type(' + columnNo + ')');
			return colBtn;
		}
		catch {
			return -1;
		}
	}

	var clickBaseCur = function (baseCurrency) {
		try {
			colBtn = getBtnCurrency(baseCurrency);
			colBtn.click();
			return 0;
		}
		catch {
			return -1;
		}
	}

	var getPrices = function (baseCurrency) {
		try {
			colBtn = getBtnCurrency(baseCurrency);
			if (!colBtn.classList.contains('active')) {
				return -1;
			}
			let pricesrootElemStr = '#root>div>div:nth-last-child(1)>div>div:nth-of-type(1)>div>div:nth-of-type(2)';
			let orderLength = getCount(document.querySelector(pricesrootElemStr), false);
			let data = [];
			for (let i = 1; i <= orderLength; i++) {
				let orderElemStr = pricesrootElemStr + '>a:nth-of-type(' + i + ')';
				let coinTitleStr = orderElemStr + '>div:nth-of-type(2)>div:nth-of-type(1)>span';
				let coinPercentChangeStr = orderElemStr + '>div:nth-of-type(2)>div:nth-of-type(2)>span';
				let coinPriceStr = orderElemStr + '>div:nth-of-type(3)>div>span';

				let coinTitle = document.querySelector(coinTitleStr).textContent.trim().toLowerCase();
				let coinPercentChange = document.querySelector(coinPercentChangeStr).innerHTML;
				let coinPrice = document.querySelector(coinPriceStr).innerHTML;

				data.push({ coin: coinTitle, perchange: coinPercentChange, price: coinPrice });
			}
			console.log(baseCurrency + ' coins: ', data);
			return data;
		}
		catch {
			return -1;
		}
	}

	var timeout = function (time) {
		return new Promise(function (resolve, reject) {
			setTimeout(function () { resolve(time); }, time);
		});
	};

	var t = 300;
	var max = 10;
	var stage = '';
	var allData = {};
	var errors = false;
	var singleerror = false;

	if (window.location.hostname != "wazirx.com") {
		await timeout(300);
		allData['errors'] = true;
		chrome.runtime.sendMessage(allData, function (response) {
			console.log('response from extension:', response);
		});
		return allData;
	}

	for (let i = 0; i < max; i++) {
		console.log('click orders try number:', i);
		let data = clickOrders();
		if (data == -1) {
			singleerror = true;
			await timeout(t);
		}
		else {
			singleerror = false;
			break;
		}
	}
	errors = errors || singleerror;
	await timeout(50);
	stage = 'orders';
	for (let i = 0; i < max; i++) {
		console.log('orders try number:', i);
		let data = await getOrders();
		if (data == -1) {
			singleerror = true;
			await timeout(t);
		}
		else {
			singleerror = false;
			allData[stage] = data;
			break;
		}
	}
	errors = errors || singleerror;

	let curs = ['inr', 'usdt', 'wrx', 'btc'];

	let oldFilterVal = clearFilters('');
	await timeout(200);

	for (let c = 0; c < curs.length; c++) {
		currency = curs[c];
		for (let i = 0; i < max; i++) {
			console.log('click ' + currency + ' try number:', i);
			let data = clickBaseCur(currency);
			if (data == -1) {
				singleerror = true;
				await timeout(t);
			}
			else {
				singleerror = false;
				break;
			}
		}
		errors = errors || singleerror;
		await timeout(50);
		stage = currency + 'prices';
		for (let i = 0; i < max; i++) {
			console.log(currency + ' prices try number:', i);
			let data = getPrices(currency);
			if (data == -1) {
				singleerror = true;
				await timeout(t);
			}
			else {
				singleerror = false;
				allData[stage] = data;
				break;
			}
		}
		errors = errors || singleerror;
	}

	clearFilters(oldFilterVal);

	allData['errors'] = errors;

	console.log('errors:', errors);
	console.log('alldata:', allData);

	chrome.runtime.sendMessage(allData, function (response) {
		console.log('response from extension:', response);
	});

	clickBaseCur('inr');

	return allData;
}


var processNum = function (str) {
	if (typeof (str) == 'number') return str;
	let n = str.replace(/[^0-9.-]+/g, "");
	return (n.length == 0 || n === '-') ? '-99999999' : Number(n);
}

var isNegative = function (str) {
	return str.indexOf('-') > -1;
}

var createMatrix = function (data) {
	matrix = [];

	data['orders'].forEach(orderElem => {
		let coinName = orderElem['coin'];
		let pricePurchased = orderElem['price'];
		let coinCategory = coinName.split("/")[1] + 'prices';
		let searchArray = data[coinCategory];
		cIndex = searchArray.findIndex((element) => { return element['coin'] == coinName; });
		let priceMarket = data[coinCategory][cIndex]['price'];
		let perChangeInvestment = 100 * (processNum(priceMarket) - processNum(pricePurchased)) / processNum(pricePurchased);
		if (perChangeInvestment >= 0)
			perChangeInvestment = '▲' + (Math.round(perChangeInvestment * 100) / 100) + '%';
		else
			perChangeInvestment = '▼' + (Math.round(perChangeInvestment * 100) / 100) + '%';
		let purchasedAmount = orderElem['purchased'];

		if (coinCategory == 'inrprices') {
			pricePurchased = '₹' + pricePurchased;
		}
		else if (coinCategory == 'usdtprices') {
			pricePurchased += ' USDT';
		}
		else if (coinCategory == 'wrxprices') {
			pricePurchased += ' WRX';
		}
		else if (coinCategory == 'btcprices') {
			pricePurchased += ' BTC';
		}

		matrix.push({
			coinName: coinName,
			purchasedAmount: purchasedAmount,
			pricePurchased: pricePurchased,
			priceMarket: priceMarket,
			perChangeInvestment: perChangeInvestment,
			perChangeMarket: data[coinCategory][cIndex]['perchange'].replace(/ /g, ''),
			buy: orderElem['buy']
		});
	});

	console.log('table matrix:', matrix);

	renderTableTransactions(matrix);

	formatMatrix(matrix);
}

var findCoinIndex = function (coin, arrayToSearch) {
	return arrayToSearch.findIndex((element) => { return element.coinName == coin; });
}

var checkIfCoinIsAdded = function (coin, arrayToSearch) {
	return findCoinIndex(coin, arrayToSearch) > -1;
}

var formatMatrix = function (matrix) {
	var allOrderedCoinsList = [];
	matrix.forEach(singleCoin => {
		if (!checkIfCoinIsAdded(singleCoin.coinName, allOrderedCoinsList) && processNum(singleCoin.purchasedAmount) != 0)
			allOrderedCoinsList.push({
				coinName: singleCoin.coinName,
				amountLeft: 0,
				moneyLeft: 0,
				totalPriceBought: 0,
				totalPriceSold: 0,
				totalAmountBought: 0,
				totalAmountSold: 0,
				priceMarket: processNum(singleCoin.priceMarket),
				recovPercent: 0,
				profitLoss: 0,
				avgPriceBought: 0,
				avgPriceSold: 0
			});
	});

	matrix.forEach(singleCoin => {
		if (processNum(singleCoin.purchasedAmount) == 0)
			return;
		let index = findCoinIndex(singleCoin.coinName, allOrderedCoinsList);
		let perAmount = (processNum(singleCoin.purchasedAmount));
		let perPrice = (processNum(singleCoin.purchasedAmount) * processNum(singleCoin.pricePurchased));
		if (singleCoin.buy) {
			allOrderedCoinsList[index].amountLeft += perAmount
			allOrderedCoinsList[index].moneyLeft -= perPrice;
			allOrderedCoinsList[index].totalAmountBought += perAmount;
			allOrderedCoinsList[index].totalPriceBought += perPrice;

		}
		else {
			allOrderedCoinsList[index].amountLeft -= perAmount;
			allOrderedCoinsList[index].moneyLeft += perPrice;
			allOrderedCoinsList[index].totalAmountSold += perAmount;
			allOrderedCoinsList[index].totalPriceSold += perPrice;
		}
	});

	let totalProfitLoss = [0, 0, 0, 0];

	allOrderedCoinsList.forEach((singleCoin, index) => {
		let coinCategory = singleCoin.coinName.split("/")[1];
		let moneyIfSellNow = singleCoin.priceMarket * singleCoin.amountLeft;
		let profitLoss = singleCoin.moneyLeft + moneyIfSellNow;
		let avgPriceBought = singleCoin.totalPriceBought / singleCoin.totalAmountBought;
		let avgPriceSold = singleCoin.totalPriceSold / singleCoin.totalAmountSold;
		let recovPercent = Math.round(100 * profitLoss / Math.abs(singleCoin.moneyLeft) * 100) / 100;
		allOrderedCoinsList[index].recovPercent = (singleCoin.amountLeft == 0 || singleCoin.moneyLeft >= 0) ? '-' : recovPercent >= 0 ? '▲' + recovPercent + '%' : '▼' + recovPercent + '%';
		allOrderedCoinsList[index].profitLoss = profitLoss;
		allOrderedCoinsList[index].amountLeft = (Math.round(singleCoin.amountLeft * 10000) / 10000);
		avgPriceBought = (avgPriceBought.toString() == 'NaN' || avgPriceBought.toString() == 'Infinity') ? '-' : avgPriceBought;
		avgPriceSold = (avgPriceSold.toString() == 'NaN' || avgPriceSold.toString() == 'Infinity') ? '-' : avgPriceSold;

		if (coinCategory == 'inr') {
			totalProfitLoss[0] += profitLoss;
			allOrderedCoinsList[index].moneyLeft = '₹' + (Math.round(singleCoin.moneyLeft * 100) / 100);
			allOrderedCoinsList[index].priceMarket = '₹' + (Math.round(singleCoin.priceMarket * 100) / 100);
			allOrderedCoinsList[index].profitLoss = '₹' + (Math.round(singleCoin.profitLoss * 100) / 100);
			allOrderedCoinsList[index].avgPriceBought = (avgPriceBought == '-') ? '-' : '₹' + (Math.round(avgPriceBought * 100) / 100);
			allOrderedCoinsList[index].avgPriceSold = (avgPriceSold == '-') ? '-' : '₹' + (Math.round(avgPriceSold * 100) / 100);
		}
		else if (coinCategory == 'usdt') {
			totalProfitLoss[1] += profitLoss;
			allOrderedCoinsList[index].moneyLeft = (Math.round(singleCoin.moneyLeft * 100) / 100) + ' USDT';
			allOrderedCoinsList[index].priceMarket = (Math.round(singleCoin.priceMarket * 100) / 100) + ' USDT';
			allOrderedCoinsList[index].profitLoss = (Math.round(singleCoin.profitLoss * 100) / 100) + ' USDT';
			allOrderedCoinsList[index].avgPriceBought = (avgPriceBought == '-') ? '-' : (Math.round(avgPriceBought * 100) / 100) + ' USDT';
			allOrderedCoinsList[index].avgPriceSold = (avgPriceSold == '-') ? '-' : (Math.round(avgPriceSold * 100) / 100) + ' USDT';
		}
		else if (coinCategory == 'wrx') {
			totalProfitLoss[2] += profitLoss;
			allOrderedCoinsList[index].moneyLeft = (Math.round(singleCoin.moneyLeft * 100) / 100) + ' WRX';
			allOrderedCoinsList[index].priceMarket = (Math.round(singleCoin.priceMarket * 100) / 100) + ' WRX';
			allOrderedCoinsList[index].profitLoss = (Math.round(singleCoin.profitLoss * 100) / 100) + ' WRX';
			allOrderedCoinsList[index].avgPriceBought = (avgPriceBought == '-') ? '-' : (Math.round(avgPriceBought * 100) / 100) + ' WRX';
			allOrderedCoinsList[index].avgPriceSold = (avgPriceSold == '-') ? '-' : (Math.round(avgPriceSold * 100) / 100) + ' WRX';
		}
		else if (coinCategory == 'btc') {
			totalProfitLoss[3] += profitLoss;
			allOrderedCoinsList[index].moneyLeft = (Math.round(singleCoin.moneyLeft * 100) / 100) + ' BTC';
			allOrderedCoinsList[index].priceMarket = (Math.round(singleCoin.priceMarket * 100) / 100) + ' BTC';
			allOrderedCoinsList[index].profitLoss = (Math.round(singleCoin.profitLoss * 100) / 100) + ' BTC';
			allOrderedCoinsList[index].avgPriceBought = (avgPriceBought == '-') ? '-' : (Math.round(avgPriceBought * 100) / 100) + ' BTC';
			allOrderedCoinsList[index].avgPriceSold = (avgPriceSold == '-') ? '-' : (Math.round(avgPriceSold * 100) / 100) + ' BTC';
		}
	});

	console.log('computations for P/L:', allOrderedCoinsList);

	renderTableComputations(allOrderedCoinsList, totalProfitLoss);
}

var renderTableTransactions = function (matrix) {
	let tableString = `<table class="table table-striped table-hover align-middle">
						<thead>
						<tr>
							<th scope="col">#</th>
							<th scope="col">Coin</th>
							<th scope="col">Amount</th>
							<th scope="col">B/S. Price</th>
							<th scope="col">Curr. M. Price</th>
							<th scope="col">Change %</th>
							<th scope="col">Trend %</th>
						</tr>
						</thead>
						<tbody>`;
	let count = 0;
	matrix.forEach(row => {
		if (processNum(row.purchasedAmount) == 0) {
			return;
		}
		let colorBuy = row.buy ? 'buyTrans' : 'sellTrans';
		let colorClassInvest = isNegative(row.perChangeInvestment) ? 'text-danger' : 'text-success';
		let colorClassMarket = isNegative(row.perChangeMarket) ? 'text-danger' : 'text-success';
		tableString += `<tr class="${colorBuy}">
						<th scope="row">${++count}</th>
						<td>${row.coinName.toUpperCase()}</td>
						<td data-order="${processNum(row.purchasedAmount)}">${row.purchasedAmount}</td>
						<td data-order="${processNum(row.pricePurchased)}">${row.pricePurchased}</td>
						<td data-order="${processNum(row.priceMarket)}">${row.priceMarket}</td>
						<td class="${colorClassInvest}" data-order="${processNum(row.perChangeInvestment)}">${row.perChangeInvestment}</td>
						<td class="${colorClassMarket}" data-order="${processNum(row.perChangeMarket)}">${row.perChangeMarket}</td>
					</tr>`;
	});
	tableString += `</tbody>
		</table>`;

	document.querySelector('#tableTransactions').innerHTML = tableString;
	// DataTable start
	$('#tableTransactions>table').DataTable({
		dom: '<"#transactIp.dataTablecustomInput"f>t',
		paging: false,
		info: false,
		language: {
			searchPlaceholder: 'Search records',
			search: '',
		},
		initComplete: bindInputs
	});
	// DataTable end
}

var renderTableComputations = function (matrix, totalProfitLoss) {
	let captionText = '<span class="text-body fw-bold">Total Profit/Loss (all coins):</span> ';
	for (let i = 0; i < totalProfitLoss.length; i++) {
		totalProfitLoss[i] = (Math.round(totalProfitLoss[i] * 100) / 100).toString();
		let colorCaption = isNegative(totalProfitLoss[i]) ? 'text-danger' : 'text-success';
		if (i == 0) {
			captionText += `<span class="${colorCaption} fw-bold">₹${totalProfitLoss[i]}</span>, `;
		}
		else if (i == 1) {
			captionText += `<span class="${colorCaption} fw-bold">${totalProfitLoss[i]} USDT</span>, `;
		}
		else if (i == 2) {
			captionText += `<span class="${colorCaption} fw-bold">${totalProfitLoss[i]} WRX</span>, `;
		}
		else if (i == 3) {
			captionText += `<span class="${colorCaption} fw-bold">${totalProfitLoss[i]} BTC</span>`;
		}

	}

	let tableString = `<table class="table table-striped table-hover align-middle">
						<caption>${captionText}</caption>
						<thead>
						<tr>
							<th scope="col">#</th>
							<th scope="col">Coin</th>
							<th scope="col">Net</th>
							<th scope="col">Av.BP.</th>
							<th scope="col">Av.SP.</th>
							<th scope="col">Curr.MP.</th>
							<th scope="col">Amt.R.</th>
							<th scope="col">Rec.%</th>
							<th scope="col">P/L</th>
						</tr>
						</thead>
						<tbody>`;
	let count = 0;
	matrix.forEach(row => {
		//if (row.amountLeft == 0) {
		//	return;
		//}
		let colorMoneySaved = isNegative(row.moneyLeft) ? 'text-danger' : 'text-success';
		let colorProfitLoss = isNegative(row.profitLoss) ? 'text-danger' : 'text-success';
		let colorRecovPercent = row.recovPercent == '-' ? '' : isNegative(row.recovPercent) ? 'text-danger' : 'text-success';
		tableString += `<tr>
						<th scope="row">${++count}</th>
						<td>${row.coinName.toUpperCase()}</td>
						<td class="${colorMoneySaved}" data-order="${processNum(row.moneyLeft)}">${row.moneyLeft}</td>
						<td data-order="${processNum(row.avgPriceBought)}">${row.avgPriceBought}</td>
						<td data-order="${processNum(row.avgPriceSold)}">${row.avgPriceSold}</td>
						<td data-order="${processNum(row.priceMarket)}">${row.priceMarket}</td>
						<td data-order="${processNum(row.amountLeft)}">${row.amountLeft}</td>
						<td class="${colorRecovPercent}" data-order="${processNum(row.recovPercent)}">${row.recovPercent}</td>
						<td class="${colorProfitLoss}" data-order="${processNum(row.profitLoss)}">${row.profitLoss}</td>
					</tr>`;
	});
	tableString += `</tbody>
		</table>`;

	document.querySelector('#tableComputations').innerHTML = tableString;
	// DataTable start
	$('#tableComputations>table').DataTable({
		dom: '<"#computeIp.dataTablecustomInput"f>t',
		paging: false,
		info: false,
		language: {
			searchPlaceholder: 'Search records',
			search: '',
		},
		initComplete: bindInputs
	});
	// DataTable end
}

// DataTable start
var bindInputs = function (settings, json) {
	$('#transactIp>div>label>input').on('input', function () {
		$("#computeIp>div>label>input").val($(this).val());
		$("#computeIp>div>label>input").trigger('keyup');
	});
	$('#computeIp>div>label>input').on('input', function () {
		$("#transactIp>div>label>input").val($(this).val());
		$("#transactIp>div>label>input").trigger('keyup');
	});
}
// DataTable end