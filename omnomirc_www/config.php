<?php

include_once(realpath(dirname(__FILE__)).'/Source/sql.php');
include_once(realpath(dirname(__FILE__)).'/Source/sign.php');
include_once(realpath(dirname(__FILE__)).'/Source/userlist.php');
include_once(realpath(dirname(__FILE__)).'/Source/admin.php');
include_once(realpath(dirname(__FILE__)).'/Source/cachefix.php');
$OmnomIRC_version = '2.5.2';
$oirc_installed = false;
$sql_server = 'localhost';
$sql_db = 'sql-db';
$sql_user = 'sql-user';
$sql_password = 'sql-passwd';
$signature_key = '';
$hostname = 'hostname';
$searchNamesUrl = 'http://www.omnimaga.org/index.php?action=ezportal;sa=page;p=13&userSearch=';
$checkLoginUrl = 'http://www.omnimaga.org/checkLogin.php';
$securityCookie = '__cfduid';
$curidFilePath = '/run/omnomirc_curid';
$calcKey = '';
$externalStyleSheet = '';

$channels=Array();
$channels[]=Array('#omnimaga',true);//Default chan, 'cause it's the first in the array.
$exChans=Array();
$exChans[]=Array('#omnimaga-ops',false);

$opGroups = array('Support Staff','President','Administrator','Coder Of Tomorrow','Anti-Riot Squad');

$hotlinks=Array();
$hotlinks[]=Array(
	'inner' => 'Full View',
	'href' => '.',
	'target' => '_top'
);
$hotlinks[]=Array(
	'inner' => 'Toggle',
	'href' => '#',
	'onclick' => 'toggleEnable()'
);
$hotlinks[]=Array(
	'inner' => 'Options',
	'href' => '?options'
);
$hotlinks[]=Array(
	'inner' => 'About',
	'onclick' => "if (document.getElementById('about').style.display=='none'){document.getElementById('about').style.display='';}else{document.getElementById('about').style.display='none';};return false"
);

$defaultChan = $channels[0][0];
if (isset($_GET['js'])) {
	header('Content-type: text/javascript');
	echo "HOSTNAME = '$hostname';\nSEARCHNAMESURL='$searchNamesUrl';";
}


$ircBot_servers = Array();
$ircBot_servers[] = Array('<first irc server>',6667);
$ircBot_servers[] = Array('<second irc server>',6667);
$ircBot_serversT = Array();
$ircBot_serversT[] = Array('<first irc server>',6667);
$ircBot_serversT[] = Array('<second irc server>',6667);
$ircBot_ident = Array();
$ircBot_ident[] = "PASS NONE\nUSER OmnomIRC OmnomIRC OmnomIRC :OmnomIRC\nNICK OmnomIRC\n";
$ircBot_ident[] = "PASS NONE\nUSER OmnomIRC OmnomIRC OmnomIRC :OmnomIRC\nNICK OmnomIRC\n";
$ircBot_identT = Array();
$ircBot_identT[] = "PASS NONE\nUSER TopicBot TopicBot TopicBot :TopicBot\nNICK TopicBot\n";
$ircBot_identT[] = "PASS NONE\nUSER TopicBot TopicBot TopicBot :TopicBot\nNICK TopicBot\n";
$ircBot_botPasswd = '';
$ircBot_botNick = 'OmnomIRC';
$ircBot_topicBotNick = 'TopicBot';

?> 
