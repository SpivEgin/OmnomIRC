<?php
/*
	OmnomIRC COPYRIGHT 2010,2011 Netham45
					   2012-2016 Sorunome

	This file is part of OmnomIRC.

	OmnomIRC is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	OmnomIRC is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with OmnomIRC.  If not, see <http://www.gnu.org/licenses/>.
*/
namespace oirc;

class OIRC{
	public static $json;
	public static $cache;
	public static $sql;
	public static $vars;
	public static $security;
	public static $networks;
	public static $relay;
	public static $users;
	public static $you;
	public static $channels;
	public static $config;
	public static function getLines($res,$table = '{db_prefix}lines',$chan = false){
		$lines = array();
		foreach($res as $result){
			if($result['type']===NULL){
				continue;
			}
			$lines[] = array(
				'curline' => ($table=='{db_prefix}lines'?(int)$result['line_number']:0),
				'type' => $result['type'],
				'network' => (int)$result['Online'],
				'time' => (int)$result['time'],
				'name' => $result['name1'],
				'message' => $result['message'],
				'name2' => $result['name2'],
				'chan' => ($chan?$chan:$result['channel']),
				'uid' => (int)$result['uid']
			);
		}
		return $lines;
	}
	public static function loadChannel($count){
		if($count < 1){ // nothing to do here
			return array();
		}
		$lines_cached = array();
		if($cache = OIRC::$cache->get('oirc_lines_'.OIRC::$you->chan)){
			$lines_cached = json_decode($cache,true);
			if(json_last_error()!==0){
				$lines_cached = array();
			}
		}
		if(($len = count($lines_cached)) >= $count){
			return array_splice($lines_cached,$len-$count,$len);
		}
		$table = '{db_prefix}lines';
		$linesExtra = array();
		$offset = count($lines_cached);
		
		$count -= $offset;
		$channel = OIRC::$sql->query_prepare("SELECT {db_prefix}getchanid(?) AS chan",array(OIRC::$you->chan));
		$channel = $channel[0]['chan'];
		// $table is NEVER user-defined, only possible values are {db_prefix}lines and {db_prefix}lines_old!!!!!
		while(true){
			$res = OIRC::$sql->query_prepare("SELECT x.* FROM
				(
					SELECT * FROM `$table`
					WHERE
					(
						`channel` = ?
						AND
						`type` != 'server'
					)
					ORDER BY `line_number` DESC
					LIMIT ?,?
				) AS x
				ORDER BY `line_number` ASC
				",array($channel,(int)$offset,(int)$count));
			
			$lines = self::getLines($res,$table,OIRC::$you->chan);
			
			if(count($lines)<$count && $table=='{db_prefix}lines'){
				$count -= count($lines);
				$table = '{db_prefix}lines_old';
				$linesExtra = $lines;
				continue;
			}
			break;
		}
		$lines_cached = array_merge($lines_cached,$lines,$linesExtra);
		OIRC::$cache->set('oirc_lines_'.OIRC::$you->chan,json_encode($lines_cached),time()+(60*60*24*3));
		return $lines_cached;
	}
	public static function getNick($uid,$net){
		$res = OIRC::$sql->query_prepare("SELECT `name` FROM `{db_prefix}userstuff` WHERE `uid`=? AND `network`=?",array((int)$uid,(int)$net));
		return $res[0]['name'];
	}
	public static function getUid($nick,$net){
		$res = OIRC::$sql->query_prepare("SELECT `uid` FROM `{db_prefix}userstuff` WHERE LOWER(`name`)=LOWER(?) AND `network`=? AND `uid`<>-1",array($nick,(int)$net));
		return ($res[0]['uid'] === NULL ? NULL : (int)$res[0]['uid']);
	}
	public static function getCheckLoginUrl(){
		$net = OIRC::$networks->get(OIRC::$you->getNetwork());
		$cl = $net['config']['checkLogin'];
		$ts = (string)time();
		$clsid = urlencode(htmlspecialchars(str_replace(';','%^%',hash_hmac('sha512',(isset($_SERVER['HTTP_REFERER'])?$_SERVER['HTTP_REFERER']:'THE GAME'),OIRC::$config['security']['sigKey'].$ts.OIRC::$you->getNetwork()).'|'.$ts)));
		if(isset($_SERVER['HTTP_REFERER'])){
			$urlhost = parse_url($_SERVER['HTTP_REFERER']);
			if($urlhost['host'] != (isset($_SERVER['HTTP_HOST'])?$_SERVER['HTTP_HOST']:$_SERVER['SERVER_NAME'])){
				$clsid = '';
			}
		}
		$cl .= '?sid='.$clsid.'&network='.(OIRC::$you->getNetwork());
		return $cl;
	}
}

class Json{
	private $json;
	private $warnings;
	private $errors;
	private $relog;
	public function clear(){
		$this->warnings = array();
		$this->errors = array();
		$this->json = array();
	}
	public function __construct(){
		$this->clear();
		$this->relog = 0;
	}
	public function addWarning($s){
		$this->warnings[] = $s;
	}
	public function addError($s){
		$this->errors[] = $s;
	}
	public function add($key,$value){
		$this->json[$key] = $value;
	}
	public function get(){
		$this->json['warnings'] = $this->warnings;
		$this->json['errors'] = $this->errors;
		$this->json['sql_queries'] = OIRC::$sql->getNumQueries();
		if($this->relog!=0){
			$this->json['relog'] = $this->relog;
		}
		return json_encode($this->json);
	}
	public function hasErrors(){
		return sizeof($this->errors) > 0;
	}
	public function hasWarnings(){
		return sizeof($this->warnings) > 0;
	}
	public function doRelog($i){
		$this->relog = $i;
	}
	public function getIndex($key){
		if(isset($this->json[$key])){
			return $this->json[$key];
		}
		return NULL;
	}
	public function deleteIndex($key){
		unset($this->json[$key]);
	}
}
OIRC::$json = new Json();

function errorHandler($errno,$errstr,$errfile,$errline){
	if(0 === error_reporting()){
		return false;
	}
	switch($errno){
		case E_USER_WARNING:
		case E_USER_NOTICE:
			OIRC::$json->addWarning(array('type' => 'php','number' => $errno,'message'=>$errstr,'file' => $errfile,'line' => $errline));
			break;
		//case E_USER_ERROR: // no need, already caught by default.
		default:
			OIRC::$json->addError(array('type' => 'php','number' => $errno,'message'=>$errstr,'file' => $errfile,'line' => $errline));
	}
}
if(!(isset($textmode) && $textmode===true)){
	set_error_handler('oirc\errorHandler',E_ALL);
	header('Content-Type: application/json');
}
header('Last-Modified: Thu, 01-Jan-1970 00:00:01 GMT');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Cache-Control: post-check=0, pre-check=0',false);
header('Pragma: no-cache');
date_default_timezone_set('UTC');

function getConfig(){
	$cfg = explode("\n",file_get_contents(realpath(dirname(__FILE__)).'/config.json.php'));
	$searchingJson = true;
	$json = "";
	foreach($cfg as $line){
		if($searchingJson){
			if(trim($line)=='?>'){
				$searchingJson = false;
			}
		}else{
			$json .= "\n".$line;
		}
	}
	return json_decode($json,true);
}
OIRC::$config = getConfig();

if(isset($argv) && php_sapi_name() == 'cli'){
	// parse command line args into $_GET
	foreach($argv as $a){
		if(($p = strpos($a,'='))!==false){
			$_GET[substr($a,0,$p)] = substr($a,$p+1) or true;
		}
	}
	define('INTERNAL',true);
}else{
	define('INTERNAL',false);
}

class Cache{
	private $mode = 0;
	private $handle = false;
	public function __construct($host = 'localhost',$port = 11211){
		if(class_exists('Memcached')){
			$this->handle = new \Memcached;
			$this->handle->addServer($host,$port);
			$this->handle->setOption(\Memcached::OPT_COMPRESSION,false); // else python won't be able to do anything
			$this->mode = 1;
		}elseif(class_exists('Memcache')){
			$this->handle = new \Memcache;
			$this->handle->connect($host,$port);
			$this->handle->setCompressThreshold(0,1); // disable compression
			$this->mode = 2;
		}
	}
	public function get($var){
		switch($this->mode){
			case 1:
			case 2:
				return $this->handle->get($var);
		}
		return false;
	}
	public function set($var,$val,$time = 0){
		switch($this->mode){
			case 1:
				return $this->handle->set($var,$val,$time);
			case 2:
				return $this->handle->set($var,$val,0,$time);
		}
	}
}
OIRC::$cache = new Cache;

function base64_url_encode($input){
	return strtr(base64_encode($input),'+/=','-_,');
}
function base64_url_decode($input){
	return base64_decode(strtr($input,'-_,','+/=')); 
}
function refValues($arr){
	if (strnatcmp(phpversion(),'5.3') >= 0){  //Reference is required for PHP 5.3+
		$refs = array();
		foreach($arr as $key => $value){
			$refs[$key] = &$arr[$key];
		}
		return $refs;
	}
	return $arr;
}
class Sql{
	private $mysqliConnection;
	private $stmt;
	private $numQueries = 0;
	private function connectSql(){
		if(isset($this->mysqliConnection)){
			return $this->mysqliConnection;
		}
		$mysqli = new \mysqli(OIRC::$config['sql']['server'],OIRC::$config['sql']['user'],OIRC::$config['sql']['passwd'],OIRC::$config['sql']['db']);
		if($mysqli->connect_errno){
			die('Could not connect to SQL DB: '.$mysqli->connect_errno.' '.$mysqli->connect_error);
		}
		if(!$mysqli->set_charset('utf8')){
			OIRC::$json->addError(array('type' => 'mysql','message' => 'Couldn\'t use utf8'));
		}
		$this->mysqliConnection = $mysqli;
		return $mysqli;
	}
	private function reportError($type,$a = array(),$stack = 1,$prep = false){
		if($prep){
			$mysqli = $this->stmt;
		}else{
			$mysqli = $this->connectSql();
		}
		$trace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS,$stack+1);
		OIRC::$json->addError(array_merge(array(
			'type' => 'mysql',
			'file' => $trace[$stack]['file'],
			'line' => $trace[$stack]['line'],
			'method' => $type,
			'errno' => $mysqli->errno,
			'error' => $mysqli->error,
		),$a));
	}
	private function parseResults($result,$stack = 1){
		if($result===false){
			$this->reportError('misc',array(),$stack+1);
			return array();
		}
		if($result===true){ //nothing returned
			return array();
		}
		$res = array();
		$i = 0;
		while($row = $result->fetch_assoc()){
			$res[] = $row;
			if($i++>=1000)
				break;
		}
		if($res === array()){
			$fields = $result->fetch_fields();
			for($i=0;$i<count($fields);$i++)
				$res[$fields[$i]->name] = NULL;
			$res = array($res);
		}
		$result->free();
		return $res;
	}
	public function prepare($query, $stack = 0){
		$mysqli = $this->connectSql();
		if(!$this->stmt = $mysqli->prepare($query)){
			$this->reportError('prepare',array('query' => $query),$stack+1);
			return false;
		}
		return true;
	}
	public function bind_param($params,$stack = 0){
		if(is_array($params)){
			if(empty($params)){
				return true; // nothing to do here!
			}
			$s = '';
			foreach($params as $p){
				switch(gettype($p)){
					case 'boolean':
					case 'integer':
						$s .= 'i';
						break;
					case 'double':
						$s .= 'd';
						break;
					default:
						$s .= 's';
				}
			}
			array_unshift($params,$s);
		}else{
			$params = func_get_args();
		}
		if(!call_user_func_array(array($this->stmt,'bind_param'),refValues($params))){
			$this->reportError('bind_param',array(),$stack+1,true);
			return false;
		}
		return true;
	}
	public function execute($stack = 0){
		if(!$this->stmt->execute()){
			$this->reportError('execute',array(),$stack+1,true);
			return false;
		}
		return true;
	}
	public function close_prepare(){
		$this->stmt->close();
	}
	public function query_prepare($query,$params = array(),$stack = 0){
		$this->numQueries++;
		$query = str_replace('{db_prefix}',OIRC::$config['sql']['prefix'],$query);
		if($this->prepare($query,$stack+1) && $this->bind_param($params,$stack+1) && $this->execute($stack +1)){
			$result = $this->stmt->get_result();
			if($result === false && $this->stmt->errno == 0){ // bug prevention
				$result = true;
			}
			$res = $this->parseResults($result,$stack + 1);
			$this->close_prepare();
			return $res;
		}
		return array();
	}
	public function query(){
		$this->numQueries++;
		$mysqli = $this->connectSql();
		$params = func_get_args();
		$query = str_replace('{db_prefix}',OIRC::$config['sql']['prefix'],$params[0]);
		$args = array();
		for($i=1;$i<count($params);$i++)
			$args[$i-1] = $mysqli->real_escape_string($params[$i]);
		
		if($mysqli->errno==1065){ //empty
			return array();
		}
		if($mysqli->errno!=0){
			$this->reportError('query',array('query' => vsprintf($query,$args)));
			return array();
		}
		
		$result = $mysqli->query(vsprintf($query,$args));
		$res = $this->parseResults($result);
		return $res;
	}
	public function insertId($stmt = false){
		if($stmt){
			return $this->stmt->insert_id;
		}
		$mysqli = $this->connectSql();
		return $mysqli->insert_id;
	}
	public function getNumQueries(){
		return $this->numQueries;
	}
}
OIRC::$sql = new Sql();

class GlobalVars{
	public function set($s,$c,$t = NULL){ //set a global variable
		$type = NULL;
		if($t===NULL){ //no third parameter, we detect the type
			switch(gettype($c)){
				case 'integer':
					$type = 1;
					break;
				case 'double':
					$type = 2;
					break;
				case 'boolean':
					$type = 4;
					break;
				case 'array':
					$c = json_encode($c);
					if(json_last_error()===0){
						$type = 5;
					}
					break;
				case 'object':
					$c = json_encode($c);
					if(json_last_error()===0){
						$type = 3;
					}
					break;
				case 'string':
				default:
					json_decode($c);
					if(json_last_error()){
						$type = 0;
					}else{
						$type = 3;
					}
			}
		}else{
			switch($t){ //user said which type he wants, we try to convert the variable
				case 'integer':
				case 'int':
					$c = (int)$c;
					$type = 1;
					break;
				case 'double':
				case 'float':
					$c = (float)$c;
					$type = 2;
					break;
				case 'boolean':
				case 'bool':
					$c = (bool)$c;
					$type = 4;
					break;
				case 'string':
				case 'str':
					$c = (string)$c;
					$type = 0;
					break;
				case 'json':
				case 'object':
					if(gettype($c)=='string'){
						json_decode($c);
						if(json_last_error()){
							return false;
						}
					}else{
						$c = json_encode($c);
						if(json_last_error()){
							return false;
						}
					}
					$type = 3;
					break;
				case 'array': //array is actually JSON, only with enabling the array option when parsing
					if(gettype($c)=='string'){
						json_decode($c);
						if(json_last_error()){
							return false;
						}
					}else{
						$c = json_encode($c);
						if(json_last_error()){
							return false;
						}
					}
					$type = 5;
					break;
			}
		}
		if($type===NULL){ //if we couldn't set a type return false
			return false;
		}
		$r = OIRC::$sql->query_prepare("SELECT id,type FROM {db_prefix}vars WHERE name=?",array($s));
		$r = $r[0];
		if(isset($r['id'])){ //check if we need to update or add a new
			OIRC::$sql->query_prepare("UPDATE {db_prefix}vars SET value=?,type=? WHERE name=?",array($c,$type,$s));
		}else{
			OIRC::$sql->query_prepare("INSERT INTO {db_prefix}vars (name,value,type) VALUES (?,?,?)",array($s,$c,(int)$type));
		}
		return true;
	}
	public function get($s){
		$params = $s;
		if(!is_array($params)){
			$params = array($params);
		}
		$ret = array();
		foreach($params as $p){
			$ret[$p] = NULL;
		}
		foreach(OIRC::$sql->query_prepare("SELECT value,type,name FROM {db_prefix}vars WHERE ".implode(' OR ',array_fill(0,count($params),'name=?')),$params) as $res){
			if(!$res['name']){
				continue;
			}
			$val = NULL;
			switch((int)$res['type']){ //convert to types, else return null
				case 0:
					$val = (string)$res['value'];
					break;
				case 1:
					$val = (int)$res['value'];
					break;
				case 2:
					$val = (float)$res['value'];
					break;
				case 3:
					$json = json_decode($res['value']);
					if(!json_last_error()){
						$val = $json;
					}
					break;
				case 4:
					$val = (bool)$res['value'];
					break;
				case 5:
					$json = json_decode($res['value'],true);
					if(!json_last_error()){
						$val = $json;
					}
					break;
			}
			$ret[$res['name']] = $val;
		}
		if(!is_array($s)){
			return $ret[$s];
		}
		return $ret;
	}
}
OIRC::$vars = new GlobalVars();

class Secure{
	private function sign($s,$u,$n,$t){
		return $t.'|'.hash_hmac('sha512',$s.$u,$n.OIRC::$config['security']['sigKey'].$t);
	}
	private function sign_guest($s,$u,$n,$t){
		return $t.'|'.hash_hmac('sha512',$u.$s,OIRC::$config['security']['sigKey'].$n.$t);
	}
	public function checkSig($sig,$nick,$uid,$network){
		$sigParts = explode('|',$sig);
		$ts = time();
		$hard = 60*60*24;
		$soft = 60*5;
		$nets = OIRC::$networks->getNetsarray();
		$doGuest = isset($nets[$network]['config']['guests']) && $nets[$network]['config']['guests'] >= 2;
		if($sig != '' && $nick != '' && isset($sigParts[1]) && ((int)$sigParts[0])==$sigParts[0]){
			$sts = (int)$sigParts[0];
			$sigs = $sigParts[1];
			if($sts > ($ts - $hard - $soft) && $sts < ($ts + $hard + $soft)){
				if($this->sign($nick,$uid,$network,(string)$sts) == $sig || ($doGuest && $this->sign_guest($nick,$uid,$network,(string)$sts) == $sig)){
					if(!($sts > ($ts - $hard) && $sts < ($ts + $hard))){
						OIRC::$json->doRelog(1);
					}
					return true;
				}
				OIRC::$json->doRelog(3);
				return false;
			}else{
				if($this->sign($nick,$uid,$network,(string)$sts) == $sig || ($doGuest && $this->sign_guest($nick,$uid,$network,(string)$sts) == $sig)){
					OIRC::$json->doRelog(2);
				}else{
					OIRC::$json->doRelog(3);
				}
				return false;
			}
		}
		OIRC::$json->doRelog(3);
		return false;
	}
	public function getGuestSig($nick,$network){
		return $this->sign_guest($nick,'-1',$network,(string)time());
	}
}
OIRC::$security = new Secure();

class Networks{
	private $nets;
	public function __construct(){
		$this->nets = array();
		foreach(OIRC::$config['networks'] as $n){
			$this->nets[$n['id']] = $n;
		}
	}
	public function get($i){
		if(isset($this->nets[$i])){
			return $this->nets[$i];
		}
		return NULL;
	}
	public function getNetsarray(){
		return $this->nets;
	}
	public function getNetworkId(){
		if(isset($_GET['network'])){
			if(($n = $this->get((int)$_GET['network'])) != NULL){
				if($n['type'] == 1 || isset($_GET['serverident']) && $n['type']==0){
					return $n['id'];
				}
			}
		}
		return OIRC::$config['settings']['defaultNetwork'];
	}
}
OIRC::$networks = new Networks();

class Relay{
	private $sendBuffer = array();
	private function socketfail(){
		shell_exec('php '.realpath(dirname(__FILE__)).'/admin.php internalAction=deactivateBot'); // TODO: some better way to do this :P
	}
	public function sendLine($n1,$n2,$t,$m,$c = NULL,$s = NULL,$uid = NULL){
		if($c === NULL){
			$c = OIRC::$you->chan;
		}
		if($s === NULL){
			$s = OIRC::$you->getNetwork();
		}
		if($uid === NULL){
			$uid = OIRC::$you->getUid();
		}
		$this->sendBuffer[] = array(
			'n1' => $n1,
			'n2' => $n2,
			't' => $t,
			'm' => $m,
			'c' => $c,
			's' => $s,
			'uid' => $uid
		);
	}
	public function getSocket(){
		$sock = OIRC::$config['settings']['botSocket'];
		$socket = false;
		if(substr($sock,0,5) == 'unix:'){
			$socket = socket_create(AF_UNIX,SOCK_STREAM,0);
			if(!socket_connect($socket,substr($sock,5))){
				$this->socketfail();
				return false;
			}
		}else{
			$matches = array();
			preg_match('/^([\\w\\.]+):(\\d+)/',$sock,$matches);
			if($matches){
				$socket = socket_create(AF_INET,SOCK_STREAM,SOL_TCP);
				if(!socket_connect($socket,$matches[1],$matches[2])){
					$this->socketfail();
					return false;
				}
			}
		}
		return $socket;
	}
	public function commitBuffer(){
		if(sizeof($this->sendBuffer)>0){
			$values = '';
			$valArray = array();
			foreach($this->sendBuffer as $line){
				$values .= '(?,?,?,?,{db_prefix}getchanid(?),?,?,UNIX_TIMESTAMP(CURRENT_TIMESTAMP)),';
				if($line['n1'] == '' && $line['n2'] == ''){
					continue;
				}
				$valArray = array_merge($valArray,array(
					$line['n1'],
					$line['n2'],
					$line['t'],
					$line['m'],
					$line['c'],
					$line['s'],
					$line['uid']
				));
			}
			if(sizeof($valArray) > 0){
				$values = rtrim($values,',');
				OIRC::$sql->query_prepare("INSERT INTO `{db_prefix}lines` (name1,name2,type,message,channel,online,uid,time) VALUES $values",$valArray);
			}
			
			
			if(OIRC::$config['settings']['useBot']){
				$sock = OIRC::$config['settings']['botSocket'];
				
				if($socket = $this->getSocket()){
					$socketBuf = '';
					foreach($this->sendBuffer as $line){
						$socketBuf .= trim(json_encode($line))."\n";
					}
					socket_set_nonblock($socket);
					socket_write($socket,$socketBuf,strlen($socketBuf));
					socket_close($socket);
				}
			}
			$this->sendBuffer = array();
			if(substr(OIRC::$config['settings']['curidFilePath'],0,1) == '/'){
				file_put_contents(OIRC::$config['settings']['curidFilePath'],OIRC::$sql->insertId());
			}else{
				file_put_contents(realpath(dirname(__FILE__)).'/'.OIRC::$config['settings']['curidFilePath'],OIRC::$sql->insertId());
			}
		}
	}
}
OIRC::$relay = new Relay();

class Users{
	public function notifyJoin($nick,$channel,$net,$uid = -1){
		if($nick){
			OIRC::$relay->sendLine($nick,'','join','',$channel,(int)$net,(int)$uid);
		}
	}
	public function notifyPart($nick,$channel,$net,$uid = -1){
		if($nick){
			OIRC::$relay->sendLine($nick,'','part','',$channel,(int)$net,(int)$uid);
		}
	}
	public function clean(){
		$result = OIRC::$sql->query_prepare("SELECT `username`,`channel`,`online`,`uid` FROM `{db_prefix}users` WHERE (`time` < ? and `time`!=0) AND `isOnline`=1",array(strtotime('-5 minutes')));
		OIRC::$sql->query_prepare("UPDATE `{db_prefix}users` SET `isOnline`=0 WHERE (`time` < ? and `time`!=0) AND `isOnline`=1",array(strtotime('-5 minutes')));
		foreach($result as $row){
			$this->notifyPart($row['username'],$row['channel'],(int)$row['online'],(int)$row['uid']);
		}
	}
}
OIRC::$users = new Users();

class You{
	public $nick;
	private $sig;
	private $id;
	private $loggedIn;
	private $globalOps;
	private $ops;
	private $infoStuff;
	private $network;
	private $chanName;
	public $chan;
	public function __construct($n = false){
		global $ADMINPAGE;
		if($n!==false){
			$this->nick = $n;
		}elseif(isset($_GET['nick'])){
			$this->nick = base64_url_decode($_GET['nick']);
		}else{
			OIRC::$json->addError('Nick not set');
			$this->nick = '';
		}
		if(isset($_GET['signature'])){
			$this->sig = base64_url_decode($_GET['signature']);
		}else{
			OIRC::$json->addError('Signature not set');
			$this->sig = '';
		}
		if(isset($_GET['id'])){
			$this->id = (int)$_GET['id'];
		}else{
			OIRC::$json->addWarning('ID not set, some features may be unavailable');
			$this->id = -1;
		}
		
		$this->network = OIRC::$networks->getNetworkId();
		
		if($this->network == 0){ // server network, do aditional validating
			if(!isset($_GET['serverident']) || !OIRC::$security->checkSig($this->sig,$this->nick,$this->id,$this->network)){
				OIRC::$json->addError('Login attempt as server');
				echo OIRC::$json->get();
				die();
			}
			$this->globalOps = false;
			$this->ops = false;
			$this->loggedIn = true;
		}else{
			$this->globalOps = NULL;
			$this->loggedIn = OIRC::$security->checkSig($this->sig,$this->nick,$this->id,$this->network);
		}
		$this->infoStuff = NULL;
		if(!$this->loggedIn){
			if(!isset($_GET['noLoginErrors'])){
				OIRC::$json->addWarning('Not logged in');
				$this->nick = '';
			}else{
				$this->nick = false;
			}
		}
		
		
		if(isset($_GET['channel'])){
			if(preg_match('/^\d+$/',$_GET['channel'])){
				$this->setChan($_GET['channel']);
			}else{
				$this->setChan(base64_url_decode($_GET['channel']));
			}
		}else{
			if($ADMINPAGE!==true){
				$order = -1;
				$defaultChan = '';
				foreach(OIRC::$config['channels'] as $chan){
					if($chan['enabled']){
						foreach($chan['networks'] as $cn){
							if($cn['id'] == $this->network && ($order == -1 || $cn['order']<$order)){
								$order = $cn['order'];
								$defaultChan = $chan['id'];
							}
						}
					}
				}
				OIRC::$json->addWarning('Didn\'t set a channel, defaulting to '.$defaultChan);
			}else{
				$defaultChan = 'false';
			}
			$this->chan = $defaultChan;
		}
	}
	public function setChan($channel){
		if($channel == ''){
			OIRC::$json->addError('Invalid channel');
			echo OIRC::$json->get();
			die();
		}
		if(!preg_match('/^\d+$/',$channel) && $channel[0]!="*" && $channel[0]!="#" && $channel[0]!="@" && $channel[0]!="&"){
			OIRC::$json->addError('Invalid channel');
			echo OIRC::$json->get();
			die();
		}
		if(($channel[0] == '*' || $channel[0] == '@') && (!$this->loggedIn || $this->id == -1)){
			OIRC::$json->add('message','<span style="color:#C73232;"><b>ERROR:</b> Pm/oirc chans not available for guests</span>');
			OIRC::$json->addError('Pm not available for guests');
			echo OIRC::$json->get();
			die();
		}
		
		if($channel[0] == '*' && $this->getPmHandler() != '' && (!preg_match('/^(\[\d+,\d+\]){2}$/',ltrim($channel,'*')) || strpos($channel,$this->getPmHandler())===false)){
			OIRC::$json->addError('Invalid PM channel');
			echo OIRC::$json->get();
			die();
		}
		$this->chanName = $channel;
		if($channel[0]=='#' || $channel[0]=='&' || preg_match('/^[0-9]+$/',$channel)){
			$foundChan = false;
			foreach(OIRC::$config['channels'] as $chan){
				if($chan['enabled']){
					foreach($chan['networks'] as $cn){
						if(($cn['id'] == $this->network || $this->network == 0 /* super sneaky server network */) && (strtolower($cn['name'])==strtolower($channel) || $chan['id']==$channel)){
							$channel = $chan['id'];
							$this->chanName = $cn['name'];
							$foundChan = true;
							break;
						}
					}
				}
				if($foundChan){
					break;
				}
			}
			if(!$foundChan){
				OIRC::$json->addError('Invalid channel');
				echo OIRC::$json->get();
				die();
			}
		}
		$this->chan = strtolower($channel);
	}
	public function channelName(){
		return $this->chanName;
	}
	public function getUrlParams(){
		return 'nick='.base64_url_encode($this->nick).'&signature='.base64_url_encode($this->sig).'&id='.($this->id).'&channel='.(preg_match('/^[0-9]+$/',$this->chan)?$this->chan:base64_url_encode($this->chan)).'&network='.$this->getNetwork();
	}
	public function update(){
		if($this->chan[0]=='*' || $this->nick == ''){
			return;
		} // INSERT INTO `{db_prefix}users` (`username`,`channel`,`online`,`time`) VALUES ('Sorunome',0,1,9001) ON DUPLICATE KEY UPDATE `time`=UNIX_TIMESTAMP(CURRENT_TIMESTAMP)
		$result = OIRC::$sql->query_prepare("SELECT usernum,time,isOnline,uid FROM `{db_prefix}users` WHERE `username`=? AND `channel`=? AND `online`=?",array($this->nick,$this->chan,$this->getNetwork()));
		if($result[0]['usernum']!==NULL){ //Update  
			OIRC::$sql->query_prepare("UPDATE `{db_prefix}users` SET `time`=UNIX_TIMESTAMP(CURRENT_TIMESTAMP),`isOnline`=1,`uid`=? WHERE `usernum`=?",array($this->getUid(),(int)$result[0]['usernum']));
			if((int)$result[0]['isOnline'] == 0){
				OIRC::$users->notifyJoin($this->nick,$this->chan,$this->getNetwork(),$this->getUid());
			}
		}else{
			OIRC::$sql->query_prepare("INSERT INTO `{db_prefix}users` (`username`,`channel`,`time`,`online`,`uid`) VALUES (?,?,UNIX_TIMESTAMP(CURRENT_TIMESTAMP),?,?)",array($this->nick,$this->chan,$this->getNetwork(),$this->getUid()));
			OIRC::$users->notifyJoin($this->nick,$this->chan,$this->getNetwork(),$this->getUid());
		}
		if(!OIRC::$config['settings']['useBot']){
			OIRC::$users->clean();
		}
		OIRC::$relay->commitBuffer();
	}
	public function info(){
		if($this->infoStuff !== NULL){
			return $this->infoStuff;
		}
		$temp = OIRC::$sql->query_prepare("SELECT usernum,name,ignores,kicks,globalOp,globalBan,network,uid FROM `{db_prefix}userstuff` WHERE uid=? AND network=?",array($this->id,$this->network));
		$userSql = $temp[0];
		if($this->loggedIn && $this->network != 0 /* server network has no info */){
			if($userSql['uid']===NULL){
				OIRC::$sql->query_prepare("INSERT INTO `{db_prefix}userstuff` (name,uid,network) VALUES (?,?,?)",array($this->nick,$this->id,$this->network));
				$temp = OIRC::$sql->query_prepare("SELECT usernum,name,ignores,kicks,globalOp,globalBan,network,uid FROM `{db_prefix}userstuff` WHERE usernum=?",array(OIRC::$sql->insertId()));
				$userSql = $temp[0];
			}
			if($userSql['name'] != $this->nick){
				OIRC::$sql->query_prepare("UPDATE `{db_prefix}userstuff` SET `name`=? WHERE uid=? AND network=?",array($this->nick,$this->id,$this->network));
				$userSql['name'] = $this->nick;
			}
		}
		$this->infoStuff = $userSql;
		return $userSql;
	}
	public function isGlobalOp(){
		if(!OIRC::$config['info']['installed']){
			return true;
		}
		if($this->globalOps !== NULL){
			return $this->globalOps;
		}
		if(!$this->loggedIn){
			$this->globalOps = false;
			return false;
		}
		$userSql = $this->info();
		if($userSql['globalOp']){
			$this->globalOps = true;
			return true;
		}
		$net = OIRC::$networks->get($this->getNetwork());
		if($net['config']['checkLoginAbs'] !== ''){
			$returnPosition = json_decode(trim(shell_exec('php '.escapeshellarg($net['config']['checkLoginAbs']).'/index.php op='.(int)$this->id)),true);
		}else{
			$returnPosition = json_decode(trim(file_get_contents($net['config']['checkLogin'].'?op='.$this->id)),true);
		}
		if(isset($returnPosition['op']) && $returnPosition['op']){
			$this->globalOps = true;
			return true;
		}
		$this->globalOps = false;
		return false;
	}
	public function isOp(){
		if($this->ops !== NULL){
			return $this->ops;
		}
		if($this->isGlobalOp()){
			$this->ops = true;
			return true;
		}
		if(OIRC::$channels->isOp($this->chan,$this->nick,$this->network)){
			$this->ops = true;
			return true;
		}
		$this->ops = false;
		return false;
	}
	public function isGlobalBanned(){
		$userSql = $this->info();
		return $userSql['globalBan']=='1';
	}
	public function isBanned(){
		$userSql = $this->info();
		if($userSql['globalBan']=='1' || OIRC::$channels->isBanned($this->chan,$this->nick,$this->network)){
			return true;
		}
		if(!$this->isLoggedIn()){
			$n = OIRC::$networks->get($this->network);
			if($n===NULL || $n['config']['guests'] == 0){
				return true;
			}
		}
		return false;
	}
	public function getNetwork(){
		return $this->network;
	}
	public function isLoggedIn(){
		return $this->loggedIn;
	}
	public function getUid(){
		return $this->id;
	}
	public function getPmHandler(){
		if(!$this->loggedIn || $this->id == -1){
			return '';
		}
		return '['.$this->network.','.$this->id.']';
	}
	public function getWholePmHandler($nick,$net = false){
		$youhandler = $this->getPmHandler();
		if($youhandler == ''){
			return '';
		}
		if($net === false){
			$net = $this->network;
		}
		$uid = OIRC::getUid($nick,$net);
		if($uid === NULL || $uid == -1){
			return '';
		}
		$otherhandler = '['.$net.','.$uid.']';
		if($net < $this->network){
			return $otherhandler.$youhandler;
		}elseif($this->network < $net){
			return $youhandler.$otherhandler;
		}elseif($uid < $this->id){
			return $otherhandler.$youhandler;
		}else{
			return $youhandler.$otherhandler;
		}
	}
}
OIRC::$you = new You();

class Channels{
	private $lastFetchType;
	private $allowed_types = array('ops','bans');
	private $chanIdCache = array();
	private function getChanId($chan,$create = false){
		if(isset($this->chanIdCache[$chan])){
			return $this->chanIdCache[$chan];
		}
		$tmp = OIRC::$sql->query_prepare("SELECT `channum` FROM `{db_prefix}channels` WHERE chan=LOWER(?)",array($chan));
		$tmp = $tmp[0];
		if($tmp['channum']===NULL){
			if($create){
				OIRC::$sql->query_prepare("INSERT INTO `{db_prefix}channels` (`chan`) VALUES (LOWER(?))",array($chan));
				return $this->chanIdCache[$chan] = (int)OIRC::$sql->insertId();
			}else{
				return -1;
			}
		}
		return $this->chanIdCache[$chan] = (int)$tmp['channum'];
	}
	private function isTypeById($type,$id,$nick,$network){
		$uid = OIRC::getUid($nick,$network);
		if($uid === NULL){
			return false;
		}
		// $type is NEVER user-defined, only possible values 'ops' and 'bans'
		if(!in_array($type,$this->allowed_types)){
			return false;
		}
		$res = OIRC::$sql->query_prepare("SELECT `$type` FROM `{db_prefix}channels` WHERE `channum`=?",array($id));
		$res = json_decode($res[0][$type],true);
		if(json_last_error() || !isset($res[0])){
			return false;
		}
		$this->lastFetchType = $res;
		foreach($res as $i => $r){
			if($r['uid'] == $uid && $r['net'] == (int)$network){
				return $i;
			}
		}
		return false;
	}
	private function addType($type,$chan,$nick,$network){
		$uid = OIRC::getUid($nick,$network);
		if($uid === NULL){
			return false;
		}
		
		$id = $this->getChanId($chan,true);
		if($this->isTypeById($type,$id,$nick,$network)!==false){
			return false;
		}
		$res = $this->lastFetchType;
		$res[] = array(
			'uid' => (int)$uid,
			'net' => (int)$network
		);
		// $type is NEVER user-defined, only possible values 'ops' and 'bans'
		if(!in_array($type,$this->allowed_types)){
			return false;
		}
		OIRC::$sql->query_prepare("UPDATE `{db_prefix}channels` SET `$type`=? WHERE `channum`=?",array(json_encode($res),$id));
		return true;
	}
	private function remType($type,$chan,$nick,$network){
		$id = $this->getChanId($chan);
		if($id == -1){
			return false;
		}
		$offset = $this->isTypeById($type,$id,$nick,$network);
		if($offset===false){
			return false;
		}
		$res = $this->lastFetchType;
		unset($res[$offset]);
		// $type is NEVER user-defined, only possible values 'ops' and 'bans'
		if(!in_array($type,$this->allowed_types)){
			return false;
		}
		OIRC::$sql->query_prepare("UPDATE `{db_prefix}channels` SET `$type`=? WHERE `channum`=?",array(json_encode($res),$id));
		return true;
	}
	private function isType($type,$chan,$nick,$network){
		$id = $this->getChanId($chan);
		if($id == -1){
			return false;
		}
		return $this->isTypeById($type,$id,$nick,$network)!==false;
	}
	public function setTopic($chan,$topic){
		OIRC::$cache->set('oirc_topic_'.$chan,$topic);
		OIRC::$sql->query_prepare("UPDATE `{db_prefix}channels` SET `topic`=? WHERE `channum`=?",array($topic,$this->getChanId($chan,true)));
	}
	public function getTopic($chan){
		if($cache = OIRC::$cache->get('oirc_topic_'.$chan)){
			return $cache;
		}
		$id = $this->getChanId($chan);
		if($id == -1){
			$cache = '';
		}else{
			$res = OIRC::$sql->query_prepare("SELECT `topic` FROM `{db_prefix}channels` WHERE `channum`=?",array($id));
			$res = $res[0]['topic'];
			if($res===NULL){
				$cache = '';
			}else{
				$cache = $res;
			}
		}
		OIRC::$cache->set('oirc_topic_'.$chan,$cache);
		return $cache;
	}
	public function addOp($chan,$nick,$network){
		return $this->addType('ops',$chan,$nick,$network);
	}
	public function remOp($chan,$nick,$network){
		return $this->remType('ops',$chan,$nick,$network);
	}
	public function addBan($chan,$nick,$network){
		return $this->addType('bans',$chan,$nick,$network);
	}
	public function remBan($chan,$nick,$network){
		return $this->remType('bans',$chan,$nick,$network);
	}
	public function isOp($chan,$nick,$network){
		return $this->isType('ops',$chan,$nick,$network);
	}
	public function isBanned($chan,$nick,$network){
		return $this->isType('bans',$chan,$nick,$network);
	}
	private function getModesArray($chan){
		$modes = array(
			'+' => array(),
			'-' => array()
		);
		$modestring = $this->getModes($chan);
		$add = NULL;
		for($i=0;$i<strlen($modestring);$i++){
			$c = $modestring[$i];
			switch($c){
				case '+':
					$add = true;
					break;
				case '-':
					$add = false;
					break;
				default:
					if($add===true){
						$modes['+'][$c] = true;
					}elseif($add===false){
						$modes['-'][$c] = true;
					}
			}
		}
		return $modes;
	}
	public function isMode($chan,$c,$default = false){
		$modestring = $this->getModes($chan);
		$char = strpos($modestring,$c);
		if($char===false){
			return $default;
		}
		$minus = strpos($modestring,'-');
		return $char < $minus;
	}
	public function getModes($chan){
		if($cache = OIRC::$cache->get('oirc_chanmodes_'.$chan)){
			return $cache;
		}
		$modestring = OIRC::$sql->query_prepare("SELECT `modes` FROM `{db_prefix}channels` WHERE chan=LOWER(?)",array($chan));
		$modestring = $modestring[0]['modes'];
		if($modestring === NULL){
			$cache = '+-';
		}else{
			$cache = $modestring;
		}
		OIRC::$cache->set('oirc_chanmodes_'.$chan,$cache);
		return $cache;
	}
	public function setMode($chan,$s){
		$network = OIRC::$you->getNetwork();
		$space = strpos($s,' ');
		$modesWithArgs = 'ob';
		$allowedModes = 'obc';
		
		
		$args = array();
		if($space===false){
			$modestring = $s;
		}else{
			$modestring = substr($s,0,$space); // parse args
			$argstring = substr($s,$space+1);
			preg_match_all('/"(?:\\\\.|[^\\\\"])*"|\S+/',$argstring,$matches);
			$args = $matches[0];
			foreach($args as &$a){
				if($a[0] == '"'){
					$a = substr($a,1,strlen($a)-2);
				}
				$a = stripslashes($a);
			}
			$args = array_reverse($args);
		}
		$modes = $this->getModesArray($chan);
		
		$add = NULL;
		for($i=0;$i<strlen($modestring);$i++){
			$c = $modestring[$i];
			switch($c){
				case '+':
					$add = true;
					break;
				case '-':
					$add = false;
					break;
				case "\n":
					$add = NULL;
					break;
				default:
					if(strpos($allowedModes,$c)!==false){
						if($add===true){
							if(strpos($modesWithArgs,$c)!==false){
								$arg = array_pop($args);
								switch($c){
									case 'o':
										$this->addOp($chan,$arg,$network);
										break;
									case 'b':
										$this->addBan($chan,$arg,$network);
										break;
								}
							}else{
								unset($modes['-'][$c]);
								$modes['+'][$c] = true;
							}
						}elseif($add===false){
							if(strpos($modesWithArgs,$c)!==false){
								$arg = array_pop($args);
								switch($c){
									case 'o':
										$this->remOp($chan,$arg,$network);
										break;
									case 'b':
										$this->remBan($chan,$arg,$network);
										break;
								}
							}else{
								unset($modes['+'][$c]);
								$modes['-'][$c] = true;
							}
						}
					}
			}
		}
		$newModes = '+';
		foreach($modes['+'] as $m => $t){
			$newModes .= $m;
		}
		$newModes .= '-';
		foreach($modes['-'] as $m => $t){
			$newModes .= $m;
		}
		OIRC::$cache->set('oirc_chanmodes_'.$chan,$newModes);
		OIRC::$sql->query_prepare("UPDATE `{db_prefix}channels` SET `modes`=? WHERE `channum`=?",array($newModes,$this->getChanId($chan,true)));
		return true;
	}
}
OIRC::$channels = new Channels();
