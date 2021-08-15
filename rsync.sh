sourceFolder=$(cd "$(dirname "$0")" || exit; pwd)

cd $sourceFolder

rsync --exclude-from="$sourceFolder/rsync-exclude.list" -e "ssh -i ~/server.ppk"  -azP  $sourceFolder/*  xuxf@34.84.129.163:/code/kalata-contracts-internal/mainnet/
rsync -e "ssh -i ~/server.ppk"  -azP  $sourceFolder/deployed/assets/*  xuxf@34.84.129.163:/var/www/media/assets/
rsync -e "ssh -i ~/server.ppk"  -azP  $sourceFolder/env.js  xuxf@34.84.129.163:/code/kalata-contracts-internal/mainnet/env.js
