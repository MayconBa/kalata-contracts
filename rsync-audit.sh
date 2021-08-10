sourceFolder=$(cd "$(dirname "$0")" || exit; pwd)

cd $sourceFolder

rsync --include=contracts/ --exclude=/* -e "ssh -i ~/server.ppk"  -azP  $sourceFolder/*  xuxf@34.84.129.163:/code/kalata-contracts-for-audit/
