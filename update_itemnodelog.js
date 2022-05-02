DataType = Java.type("logbook.data.DataType");
GlobalContext = Java.type("logbook.data.context.GlobalContext");
ItemDto = Java.type("logbook.dto.ItemDto");
File = Java.type("java.io.File");
PrintWriter = Java.type("java.io.PrintWriter");
BufferedWriter = Java.type("java.io.BufferedWriter");
OutputStreamWriter = Java.type("java.io.OutputStreamWriter");
FileOutputStream = Java.type("java.io.FileOutputStream");
SimpleDateFormat = Java.type("java.text.SimpleDateFormat");

load("script/ScriptData.js");
data_prefix = "item_node_log_";

//定数
function max_ship_num() { return 7; } //艦隊の艦船の数の最大値(ログがめちゃくちゃ長くなるので連合艦隊は考えないことにする)
function max_slot_num() { return 5; } //艦船の装備の数の最大値
function max_item_num() { return 2; } //獲得するアイテムの数の最大値

//n次元ベクトルa,ｂを足す
function add_vector(a, b)
{
	return a.map(function (x, i) {
		return x + b[i];
	});
}

//獲得したアイテムのIDを名前に変換する(分からないときは不明(id)となる)
function to_item_name(id)
{
	var t = ["燃料", "弾薬", "鋼材", "ボーキサイト", "高速建造剤", "高速修復剤", "開発資材", "改修資材"][id - 1];
	if (t === void 0) {
		t = ["家具箱(小)", "家具箱(中)", "家具箱(大)"][id - 10];
	}
	
	return (t === void 0) ? "不明(".concat(id).concat(")") : t;
}

//獲得アイテムを返す
function get_items(api_data)
{
	return JSON.parse(api_data.api_itemget)
	.map(function (x) {
		return [to_item_name(x.api_id | 0), x.api_getcount | 0];
	});
}

//装備のリストを返す
function get_equipment_list(ship)
{
	if (ship === null) {
		return null;
	}
	var N = max_slot_num();
	var t = Java.from(ship.getItem2().toArray());
	t = t.concat(Array.apply(null, Array(N - t.length)).map(function (x) { return new ItemDto(); }));
	t.push(ship.getSlotExItem());
	
	return t;
}

//装備のリストから上陸用舟艇(士魂部隊除く)、特型内火艇、簡易輸送部材の数を集計する
function ship_summary(list)
{
	if (list === null) {
		return [0, 0, 0];
	}
	list = list.filter(function (x) { return x !== null; });
	
	var count = function (type2) {
		return list.filter(function (x) {
			return x.getType2() === type2;
		}).length;
	};
	var shikon = list.filter(function (x) {
		return x.getSlotitemId() === 230;
	}).length;
	return [count(24) - shikon, count(46), count(30)];
}

//艦船の名前、艦種、装備の名前、改修値を返す
function ship_detail(ship, list)
{
	if (ship === null || list === null) {
		return ["", ""].concat(Array.apply(null, Array(max_slot_num())).map(function (x) { return ["", ""]; }));
	}
	
	var items = list.reduce(function (s, x) {
		return s.concat(x === null ? ["", ""] : [x.getName(), x.getLevel()]);
	}, []);
	
	return [ship.getName(), ship.getType()].concat(items);
}

//現在地を返す
function get_area(api_data)
{
	return [
		api_data.api_maparea_id | 0,
		api_data.api_mapinfo_no | 0,
		api_data.api_no | 0
	];
}

//現在地が特定の海域ならtrue(noとcellは省略可)
function equal_area(area, world, no, cell)
{
	return area[0] === world
	&& (no === void 0 || area[1] === no)
	&& (cell === void 0 || area[2] === cell);
}

//航空偵察マスならtrue
function is_air_recon(api_data)
{
	return api_data.api_airsearch.api_plane_type > 0;
}

//航空偵察の結果
function result_of_recon(api_data)
{
	var i = api_data.api_airsearch.api_result;
	var r = ["失敗", "成功", "大成功"][i];
	return (r === void 0) ? "不明(".concat(i).concat(")") : r;
}

function get_log(data, api_data)
{
	var ships = Java.from(GlobalContext.getIsSortie())
	.map(function (x, i) {
		return x ? i + 1 : 0;
	})
	.filter(function (x) {
		return x > 0;
	})
	.map(function (x) {
		return Java.from(GlobalContext.getDock(String(x)).getShips());
	})[0];
	ships.concat(Array.apply(null, Array(max_ship_num() - ships.length)).map(function (x) { return null; }));
	
	var equip = ships.map(function (x) {
		return get_equipment_list(x);
	});
	
	var item_list = get_items(api_data);
	item_list = item_list.concat(Array.apply(null, Array(max_item_num() - item_list.length)).reduce(function (s, x) {
		return s.concat(["", ""]);
	}, []));
	
	return {
		date: new SimpleDateFormat("yyyy/MM/dd HH:mm:ss").format(data.getCreateDate()),
		detail: ships.reduce(function (s, x, i) {
			return s.concat(ship_detail(x, equip[i]));
		}, []),
		summary: equip.reduce(function (s, x) {
			return add_vector(s, ship_summary(x));
		}, [0, 0, 0]),
		area: "'".concat(get_area(api_data).join("-")),
		items: item_list,
		recon: is_air_recon(api_data) ? [result_of_recon(api_data)] : [""]
	};
}

//ログのヘッダを出力
function header()
{
	var N = max_ship_num();
	return ["日付", "海域", "航空偵察"]
	.concat(Array.apply(null, Array(max_item_num())).reduce(function (prev, x, i) {
		var t = "アイテム".concat(i + 1);
		return prev.concat([t.concat(".名前"), t.concat(".個数")]);
	}, []))
	.concat(["上陸用舟艇", "特型内火艇", "簡易輸送部材"])
	.concat(Array.apply(null, Array(N)).reduce(function (prev, x, i) {
		var t = "味方艦".concat(i + 1);
		var u = Array.apply(null, Array(max_slot_num() + 1)).reduce(function (p, y, j) {
			var v = t.concat(".装備").concat(j + 1);
			return p.concat([v.concat(".名前"), v.concat(".改修値")]);
		}, []);
		return prev.concat([t.concat(".名前"), t.concat(".艦種")]).concat(u);
	}, []))
	.toString();
}

//ログをCSVに変換
function to_csv(log)
{
	return [log.date, log.area]
	.concat(log.recon)
	.concat(log.items)
	.concat(log.summary)
	.concat(log.detail)
	.toString();
}

function write(name, csv)
{
	try {
		var file = new File(name);
		var append = file.exists();
		var w = new PrintWriter(new BufferedWriter(new OutputStreamWriter(new FileOutputStream(file, append), "utf-8")));
		if (!append) {
			w.println(header());
		}
		w.println(csv);
		w.close();
	}
	catch (e) {
		e.printStackTrace();
	}
}

function update(type, data)
{
	if (type == DataType.START || type == DataType.NEXT) {
		var api_data = data.getJsonObject().api_data;
		if (api_data.api_itemget !== null) {
			//7-1はログをとらない
			if (!equal_area(get_area(api_data), 7, 1)) {
				var csv = to_csv(get_log(data, api_data));
				write("item_node_log.txt", csv);
			}
		}
	}
}