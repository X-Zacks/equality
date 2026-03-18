---
name: aliyun-oss
description: 阿里云 OSS 文件操作指南
tools:
  - bash
install:
  - kind: pip
    spec: oss2
    mirror: https://pypi.tuna.tsinghua.edu.cn/simple
---

# 阿里云 OSS 操作 Skill

通过 ossutil 命令行或 Python SDK 操作阿里云对象存储。

## ossutil 安装

```powershell
# Windows 下载 ossutil
curl.exe -fsSLO https://gosspublic.alicdn.com/ossutil/1.7.19/ossutil-v1.7.19-windows-amd64.zip
Expand-Archive ossutil-v1.7.19-windows-amd64.zip -DestinationPath .
```

## ossutil 配置

```powershell
.\ossutil64.exe config -e oss-cn-hangzhou.aliyuncs.com -i $env:OSS_ACCESS_KEY_ID -k $env:OSS_ACCESS_KEY_SECRET
```

## 常用命令

### 列出 Bucket

```bash
ossutil64.exe ls
```

### 上传文件

```bash
ossutil64.exe cp local-file.txt oss://bucket-name/path/file.txt
```

### 下载文件

```bash
ossutil64.exe cp oss://bucket-name/path/file.txt local-file.txt
```

### 列出文件

```bash
ossutil64.exe ls oss://bucket-name/path/ --limited-num 100
```

### 删除文件

```bash
ossutil64.exe rm oss://bucket-name/path/file.txt
```

### 批量上传目录

```bash
ossutil64.exe cp -r ./local-dir/ oss://bucket-name/remote-dir/
```

## Python SDK 方式

```python
import oss2

auth = oss2.Auth(os.environ['OSS_ACCESS_KEY_ID'], os.environ['OSS_ACCESS_KEY_SECRET'])
bucket = oss2.Bucket(auth, 'https://oss-cn-hangzhou.aliyuncs.com', 'bucket-name')

# 上传
bucket.put_object('remote/path/file.txt', open('local.txt', 'rb'))

# 下载
bucket.get_object_to_file('remote/path/file.txt', 'local.txt')

# 列出
for obj in oss2.ObjectIterator(bucket, prefix='path/'):
    print(obj.key)
```

## 注意事项

- 密钥用环境变量：`$env:OSS_ACCESS_KEY_ID`、`$env:OSS_ACCESS_KEY_SECRET`
- Endpoint 按区域选择：`oss-cn-beijing`、`oss-cn-shanghai`、`oss-cn-hangzhou` 等
- 大文件（>100MB）建议用分片上传
- pip 安装用清华源：`pip install -i https://pypi.tuna.tsinghua.edu.cn/simple oss2`
