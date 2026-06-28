# 本地
cd /Users/keen/Desktop/code/projects/vite-press-docs  
pnpm build:server  
tar czf dist.tar.gz -C docs/.vitepress dist  
scp dist.tar.gz root@47.112.200.66:/opt/projects/vite-press-docs/  
ssh root@47.112.200.66 "cd /opt/projects/vite-press-docs && tar xzf dist.tar.gz"  

# 预览地址     
https://fengnovo.github.io/vite-press-docs   
