<?php
/*
    OmnomIRC COPYRIGHT 2010,2011 Netham45
                       2012-2015 Sorunome

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

if(isset($argv)){
	// parse command line args into $_GET
	foreach($argv as $a){
		if(($p = strpos($a,'='))!==false){
			$_GET[substr($a,0,$p)] = substr($a,$p+1) or true;
		}
	}
}
class Json{
	private $json;
	private $warnings;
	private $errors;
	private $relog;
	public function clear(){
		$this->warnings = Array();
		$this->errors = Array();
		$this->json = Array();
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
}
$json = new Json();

function errorHandler($errno,$errstr,$errfile,$errline){
	global $json;
	switch($errno){
		case E_USER_WARNING:
		case E_USER_NOTICE:
			$json->addWarning(Array('type' => 'php','number' => $errno,'message'=>$errstr,'file' => $errfile,'line' => $errline));
			break;
		//case E_USER_ERROR: // no need, already caught by default.
		default:
			$json->addError(Array('type' => 'php','number' => $errno,'message'=>$errstr,'file' => $errfile,'line' => $errline));
	}
}
if(!(isset($textmode) && $textmode===true)){
	set_error_handler('errorHandler',E_ALL);
	header('Content-Type: text/json');
}
header('Last-Modified: Thu, 01-Jan-1970 00:00:01 GMT');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Cache-Control: post-check=0, pre-check=0',false);
header('Pragma: no-cache');
date_default_timezone_set('UTC');
include_once(realpath(dirname(__FILE__)).'/config.php');
function base64_url_encode($input){
	return strtr(base64_encode($input),'+/=','-_,');
}
function base64_url_decode($input){
	return base64_decode(strtr($input,'-_,','+/=')); 
}
class Sqli{
	private $mysqliConnection;
	private function connectSql(){
		global $config,$json;
		if(isset($this->mysqliConnection)){
			return $this->mysqliConnection;
		}
		$mysqli = new mysqli($config['sql']['server'],$config['sql']['user'],$config['sql']['passwd'],$config['sql']['db']);
		if($mysqli->connect_errno){
			die('Could not connect to SQL DB: '.$mysqli->connect_errno.' '.$mysqli->connect_error);
		}
		if(!$mysqli->set_charset('utf8')){
			$json->addError(Array('type' => 'mysql','message' => 'Couldn\'t use utf8'));
		}
		$this->mysqliConnection = $mysqli;
		return $mysqli;
	}
	public function query(){
		//ini_set('memory_limit','-1');
		$mysqli = $this->connectSql();
		$params = func_get_args();
		$query = $params[0];
		$args = Array();
		for($i=1;$i<count($params);$i++)
			$args[$i-1] = $mysqli->real_escape_string($params[$i]);
		$result = $mysqli->query(vsprintf($query,$args));
		if($mysqli->errno==1065){ //empty
			return array();
		}
		if($mysqli->errno!=0){
			die($mysqli->error.' Query: '.vsprintf($query,$args));
		}
		if($result===true){ //nothing returned
			return Array();
		}
		$res = Array();
		$i = 0;
		while($row = $result->fetch_assoc()){
			$res[] = $row;
			if($i++>=1000)
				break;
		}
		if($res === Array()){
			$fields = $result->fetch_fields();
			for($i=0;$i<count($fields);$i++)
				$res[$fields[$i]->name] = NULL;
			$res = array($res);
		}
		$result->free();
		return $res;
	}
	public function insertId(){
		$mysqli = $this->connectSql();
		return $mysqli->insert_id;
	}
}
$sql = new Sqli();
class GlobalVars{
	public function set($s,$c,$t = NULL){ //set a global variable
		global $sql;
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
		$r = $sql->query("SELECT id,type FROM irc_vars WHERE name='%s'",$s);
		$r = $r[0];
		if(isset($r['id'])){ //check if we need to update or add a new
			$sql->query("UPDATE irc_vars SET value='%s',type='%s' WHERE name='%s'",$c,$type,$s);
		}else{
			$sql->query("INSERT INTO irc_vars (name,value,type) VALUES ('%s','%s',%d)",$s,$c,(int)$type);
		}
		return true;
	}
	public function get($s){
		global $sql;
		$res = $sql->query("SELECT value,type FROM irc_vars WHERE name='%s'",$s);
		$res = $res[0];
		switch((int)$res['type']){ //convert to types, else return false
			case 0:
				return (string)$res['value'];
			case 1:
				return (int)$res['value'];
			case 2:
				return (float)$res['value'];
			case 3:
				$json = json_decode($res['value']);
				if(json_last_error()){
					return false;
				}
				return $json;
			case 4:
				return (bool)$res['value'];
			case 5:
				$json = json_decode($res['value'],true);
				if(json_last_error()){
					return false;
				}
				return $json;
		}
		return false;
	}
}
$vars = new GlobalVars();
class Secure{
	private function sign($s,$n,$t){
		global $config;
		return $t.'|'.hash_hmac('sha512',$s,$n.$config['security']['sigKey'].$t);
	}
	public function checkSig($sig,$nick,$network){
		global $json;
		$sigParts = explode('|',$sig);
		$ts = time();
		$hard = 60*60*24;
		$soft = 60*5;
		if(isset($sigParts[1]) && ((int)$sigParts[0])==$sigParts[0]){
			$sts = (int)$sigParts[0];
			$sigs = $sigParts[1];
			if($sts > ($ts - $hard - $soft) && $sts < ($ts + $hard + $soft)){
				if($this->sign($nick,$network,(string)$sts) == $sig){
					if(!($sts > ($ts - $hard) && $sts < ($ts + $hard))){
						$json->doRelog(1);
					}
					return true;
				}
				return false;
			}else{
				if($this->sign($nick,$network,(string)$sts) == $sig){
					$json->doRelog(2);
				}else{
					$json->doRelog(3);
				}
				return false;
			}
		}
		$json->doRelog(3);
		return false;
	}
}
$security = new Secure();
class Networks{
	private $nets;
	public function __construct(){
		global $config;
		$this->nets = Array();
		foreach($config['networks'] as $n){
			$this->nets[$n['id']] = $n;
		}
	}
	public function get($i){
		if(isset($this->nets[$i])){
			return $this->nets[$i];
		}
		return NULL;
	}
	public function getNetsArray(){
		return $this->nets;
	}
	public function getNetworkId(){
		global $config;
		if(isset($_GET['network'])){
			if(($n = $this->get((int)$_GET['network'])) != NULL){
				if($n['type'] == 1){
					return $n['id'];
				}
			}
		}
		return $config['settings']['defaultNetwork'];
	}
}
$networks = new Networks();
class Users{
	public function notifyJoin($nick,$channel,$net){
		global $sql;
		if($nick){
			$sql->query("INSERT INTO `irc_lines` (name1,type,channel,time,online) VALUES ('%s','join','%s','%s',%d)",$nick,$channel,time(),(int)$net);
		}
	}
	public function notifyPart($nick,$channel,$net){
		global $sql;
		if($nick){
			$sql->query("INSERT INTO `irc_lines` (name1,type,channel,time,online) VALUES ('%s','part','%s','%s',%d)",$nick,$channel,time(),(int)$net);
		}
	}
	public function clean(){
		global $sql,$config;
		foreach($config['networks'] as $n){
			if($n['type'] == 1){
				$result = $sql->query("SELECT `username`,`channel` FROM `irc_users` WHERE (`time` < %s AND `time`!=0)  AND `online`=%d AND `isOnline`='1'",strtotime('-1 minute'),$n['id']);
				$sql->query("UPDATE `irc_users` SET `isOnline`='0' WHERE `time` < %s  AND `online`='%d' AND `isOnline`='1'",strtotime('-1 minute'),$n['id']);
				foreach($result as $row){
					$this->notifyPart($row['username'],$row['channel'],$n['id']);
				}
			}
		}
	}
}
$users = new Users();
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
		global $security,$json,$ADMINPAGE,$config,$networks;
		if($n!==false){
			$this->nick = $n;
		}elseif(isset($_GET['nick'])){
			$this->nick = base64_url_decode($_GET['nick']);
		}else{
			$json->addError('Nick not set');
			$this->nick = '';
		}
		if(isset($_GET['signature'])){
			$this->sig = base64_url_decode($_GET['signature']);
		}else{
			$json->addError('Signature not set');
			$this->sig = '';
		}
		if(isset($_GET['id'])){
			$this->id = (int)$_GET['id'];
		}else{
			$json->addWarning('ID not set, some features may be unavailable');
			$this->id = 0;
		}
		
		$this->network = $networks->getNetworkId();
		
		if(isset($_GET['channel'])){
			if(preg_match('/^[0-9]+$/',$_GET['channel'])){
				$this->setChan($_GET['channel']);
			}else{
				$this->setChan(base64_url_decode($_GET['channel']));
			}
		}else{
			if($ADMINPAGE!==true){
				$order = -1;
				$defaultChan = '';
				foreach($config['channels'] as $chan){
					if($chan['enabled']){
						foreach($chan['networks'] as $cn){
							if($cn['id'] == $this->network && ($order == -1 || $cn['order']<$order)){
								$order = $cn['order'];
								$defaultChan = $chan['id'];
							}
						}
					}
				}
				$json->addWarning('Didn\'t set a channel, defaulting to '.$defaultChan);
			}else{
				$defaultChan = 'false';
			}
			$this->chan = $defaultChan;
		}
		$this->globalOps = NULL;
		$this->ops = NULL;
		$this->infoStuff = NULL;
		$this->loggedIn = ($this->nick!=='' && $this->sig!=='' && $security->checkSig($this->sig,$this->nick,$this->network));
		if(!$this->loggedIn){
			if(!isset($_GET['noLoginErrors'])){
				$json->addWarning('Not logged in');
				$this->nick = '';
			}else{
				$this->nick = false;
			}
		}
	}
	public function setChan($channel){
		global $json,$config;
		if($channel == ''){
			$json->addError('Invalid channel');
			echo $json->get();
			die();
		}
		if(!preg_match('/^[0-9]+$/',$channel) && $channel[0]!="*" && $channel[0]!="#" && $channel[0]!="@" && $channel[0]!="&"){
			$json->addError('Invalid channel');
			echo $json->get();
			die();
		}
		$this->chanName = $channel;
		if($channel[0]=='#' || $channel[0]=='&' || preg_match('/^[0-9]+$/',$channel)){
			$foundChan = false;
			foreach($config['channels'] as $chan){
				if($chan['enabled']){
					foreach($chan['networks'] as $cn){
						if($cn['id'] == $this->network && (strtolower($cn['name'])==strtolower($channel) || $chan['id']==$channel)){
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
				$json->addError('Invalid channel');
				echo $json->get();
				die();
			}
		}
		$this->chan = $channel;
	}
	public function channelName(){
		return $this->chanName;
	}
	public function getUrlParams(){
		return 'nick='.base64_url_encode($this->nick).'&signature='.base64_url_encode($this->sig).'&id='.($this->id).'&channel='.(preg_match('/^[0-9]+$/',$this->chan)?$this->chan:base64_url_encode($this->chan)).'&network='.$this->getNetwork();
	}
	public function update(){
		global $sql,$users;
		if($this->chan[0]=='*' || $this->chan=='0'){
			return;
		}
		$result = $sql->query("SELECT usernum,time,isOnline FROM `irc_users` WHERE `username` = '%s' AND `channel` = '%s' AND `online` = %d",$this->nick,$this->chan,$this->getNetwork());
		if($result[0]['usernum']!==NULL){ //Update  
			$sql->query("UPDATE `irc_users` SET `time`='%s',`isOnline`='1' WHERE `usernum` = %d",time(),(int)$result[0]['usernum']);
			if((int)$result[0]['isOnline'] == 0){
				$users->notifyJoin($this->nick,$this->chan,$this->getNetwork());
			}
		}else{
			$sql->query("INSERT INTO `irc_users` (`username`,`channel`,`time`,`online`) VALUES ('%s','%s','%s',%d)",$this->nick,$this->chan,time(),$this->getNetwork());
			$users->notifyJoin($this->nick,$this->chan,$this->getNetwork());
		}
		$users->clean();
	}
	public function info(){
		global $sql;
		if($this->infoStuff !== NULL){
			return $this->infoStuff;
		}
		$temp = $sql->query("SELECT * FROM `irc_userstuff` WHERE name='%s' AND network=%d",strtolower($this->nick),$this->network);
		$userSql = $temp[0];
		if($userSql['name']===NULL){
			$sql->query("INSERT INTO `irc_userstuff` (name,network) VALUES ('%s',%d)",strtolower($this->nick),$this->network);
			$temp = $sql->query("SELECT * FROM `irc_userstuff` WHERE usernum=%d",$sql->insertId());
			$userSql = $temp[0];
		}
		$this->infoStuff = $userSql;
		return $userSql;
	}
	public function isGlobalOp(){
		global $config,$networks;
		if(!$config['info']['installed']){
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
		if($userSql['globalOp']==1){
			$this->globalOps = true;
			return true;
		}
		$net = $networks->get($this->getNetwork());
		$cl = $net['config']['checkLogin'];
		$returnPosition = json_decode(trim(file_get_contents($cl.'?op&u='.$this->id.'&nick='.base64_url_encode($this->nick))));
		$opGroups = array_map('strtolower',array_map('trim',array_map('strip_tags',$net['config']['opGroups'])));
		if(in_array(strtolower(trim(strip_tags($returnPosition->group))),$opGroups)){
			$this->globalOps = true;
			return true;
		}
		$this->globalOps = false;
		return false;
	}
	public function isOp(){
		global $config,$channels;
		if($this->ops !== NULL){
			return $this->ops;
		}
		if($this->isGlobalOp()){
			$this->ops = true;
			return true;
		}
		if($channels->isOp($this->chan,$this->nick,$this->network)){
			$this->ops = true;
			return true;
		}
		$this->ops = false;
		return false;
	}
	public function isBanned(){
		global $networks,$channels;
		$userSql = $this->info();
		if($userSql['globalBan']=='1' || $channels->isBanned($this->chan,$this->nick,$this->network)){
			return true;
		}
		if(!$this->isLoggedIn()){
			$n = $networks->get($this->network);
			if($n!==NULL && $n['config']['guests'] == 0){
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
}
$you = new You();
class OmnomIRC{
	public function getLines($res,$table = 'irc_lines',$overrideIgnores = false){
		global $you;
		$userSql = $you->info();
		if($userSql['name']!=NULL){
			$ignorelist = $userSql['ignores'];
		}
		$lines = Array();
		foreach($res as $result){
			if((strpos($userSql['ignores'],strtolower($result['name1'])."\n")===false) || $overrideIgnores){
				$lines[] = Array(
					'curLine' => ($table=='irc_lines'?(int)$result['line_number']:0),
					'type' => $result['type'],
					'network' => (int)$result['Online'],
					'time' => (int)$result['time'],
					'name' => $result['name1'],
					'message' => $result['message'],
					'name2' => $result['name2'],
					'chan' => $result['channel']
				);
			}
		}
		return $lines;
	}
	public function loadChannel($count){
		global $you,$sql;
		$table = 'irc_lines';
		$linesExtra = Array();
		
		while(true){
			if($you->chan[0] == '*' && $you->nick){ // PM
				$res = $sql->query("
					SELECT x.* FROM (
						SELECT * FROM `%s` 
						WHERE
						(
							(
								LOWER(`channel`) = LOWER('%s')
								AND
								LOWER(`name1`) = LOWER('%s')
							)
							OR
							(
								LOWER(`channel`) = LOWER('%s')
								AND
								LOWER(`name1`) = LOWER('%s')
							)
						)
						AND `online` = %d
						ORDER BY `line_number` DESC
						LIMIT %d
					) AS x
					ORDER BY `line_number` ASC
					",$table,substr($you->chan,1),$you->nick,$you->nick,substr($you->chan,1),$you->getNetwork(),(int)$count);
			}else{
				$res = $sql->query("
					SELECT x.* FROM (
						SELECT * FROM `%s`
						WHERE
						(
							`type` != 'server'
							AND
							`type` != 'pm'
							AND
							(
								(
									LOWER(`channel`) = LOWER('%s')
									OR
									LOWER(`channel`) = LOWER('%s')
								)
							)
							AND NOT
							(
								(`type` = 'join' OR `type` = 'part') AND `Online` = %d
							)
						)
						OR
						(
							`type` = 'server'
							AND
							LOWER(`channel`)=LOWER('%s')
							AND
							LOWER(`name2`)=LOWER('%s')
						)
						ORDER BY `line_number` DESC
						LIMIT %d
					) AS x
					ORDER BY `line_number` ASC
					",$table,$you->chan,$you->nick,$you->getNetwork(),$you->nick,$you->chan,(int)$count);
			}
			
			$lines = $this->getLines($res,$table);
			
			if(count($lines)<$count && $table=='irc_lines'){
				$count -= count($lines);
				$table = 'irc_lines_old';
				$linesExtra = $lines;
				continue;
			}
			break;
		}
		if($you->nick===false){
			$linesExtra[] = Array(
				'curLine' => 0,
				'type' => 'relog',
				'network' => 0,
				'time' => time(),
				'name' => 'OmnomIRC',
				'message' => 'Time to relog!',
				'name2' => '',
				'chan' => ''
			);
		}
		return array_merge($lines,$linesExtra);
	}
}
$omnomirc = new OmnomIRC();
class Channels{
	private $lastFetchType;
	private function getChanId($chan,$create = false){
		global $sql;
		$tmp = $sql->query("SELECT `channum` FROM `irc_channels` WHERE chan='%s'",strtolower($chan));
		$tmp = $tmp[0];
		if($tmp['channum']==NULL){
			if($create){
				$sql->query("INSERT INTO `irc_channels` (`chan`) VALUES ('%s')",strtolower($chan));
				return (int)$sql->insertId();
			}else{
				return -1;
			}
		}
		return (int)$tmp['channum'];
	}
	private function isTypeById($type,$id,$nick,$network){
		global $sql;
		$res = $sql->query("SELECT `%s` FROM `irc_channels` WHERE `channum`=%d",$type,$id);
		$res = json_decode($res[0][$type],true);
		if(json_last_error()){
			return false;
		}
		$this->lastFetchType = $res;
		foreach($res as $i => $r){
			if($r['nick'] == strtolower($nick) && $r['net'] == (int)$network){
				return $i;
			}
		}
		return false;
	}
	private function addType($type,$chan,$nick,$network){
		global $sql;
		$id = $this->getChanId($chan,true);
		if($this->isTypeById($type,$id,$nick,$network)!==false){
			return false;
		}
		$res = $this->lastFetchType;
		$res[] = Array(
			'nick' => strtolower($nick),
			'net' => (int)$network
		);
		$sql->query("UPDATE `irc_channels` SET `%s`='%s' WHERE `channum`=%d",$type,json_encode($res),$id);
		return true;
	}
	private function remType($type,$chan,$nick,$network){
		global $sql;
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
		$sql->query("UPDATE `irc_channels` SET `%s`='%s' WHERE `channum`=%d",$type,json_encode($res),$id);
		return true;
	}
	private function isType($type,$chan,$nick,$network){
		global $sql;
		$id = $this->getChanId($chan);
		if($id == -1){
			return false;
		}
		return $this->isTypeById($type,$id,$nick,$network)!==false;
	}
	public function setTopic($chan,$topic){
		global $sql;
		$sql->query("UPDATE `irc_channels` SET `topic`='%s' WHERE `channum`=%d",$topic,$this->getChanId($chan,true));
	}
	public function getTopic($chan){
		global $sql;
		$id = $this->getChanId($chan);
		if($id == -1){
			return '';
		}
		$res = $sql->query("SELECT `topic` FROM `irc_channels` WHERE `channum`=%d",$id);
		$res = $res[0]['topic'];
		if($res===NULL){
			return '';
		}
		return $res;
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
	public function setMode($chan,$s){
		global $sql,$you;
		$id = $this->getChanId($chan,true);
		$oldModes = $sql->query("SELECT `modes` FROM `irc_channels` WHERE `channum`=%d",$id);
		$oldModes = $oldModes[0]['modes'];
		if($oldModes===NULL){
			$oldModes = '';
		}
		$s = $oldModes."\n".$s;
		
		$network = $you->getNetwork();
		$space = strpos($s,' ');
		$modesWithArgs = 'ob';
		$allowedModes = 'obc';
		
		
		$args = Array();
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
		$modes = Array(
			'+' => Array(),
			'-' => Array()
		);
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
		$sql->query("UPDATE `irc_channels` SET `modes`='%s' WHERE `channum`=%d",$newModes,$id);
		return true;
	}
}
$channels = new Channels();

if(isset($_GET['ident'])){
	header('Content-Type:text/json');
	$json->add('loggedin',$you->isLoggedIn());
	$json->add('isglobalop',$you->isGlobalOp());
	$json->add('isbanned',$you->isBanned());
	echo $json->get();
	exit;
}
if(isset($_GET['getcurline'])){
	header('Content-Type:text/json');
	$json->clear();
	$json->add('curline',(int)file_get_contents($config['settings']['curidFilePath']));
	echo $json->get();
	exit;
}
?>