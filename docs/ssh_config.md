# SSH Key 多项目配置指南

本文档说明如何为不同的 GitHub 项目配置不同的 SSH key。

## 1. 生成 SSH Keys

为每个项目生成独立的 SSH key：

```bash
# 为项目1生成 SSH key
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/id_project1

# 为项目2生成 SSH key
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/id_project2
```

注意：
- 将 `your_email@example.com` 替换为你的 GitHub 邮箱
- 可以为 key 设置不同的密码，或直接回车跳过
- 建议使用 ed25519 算法，如果需要兼容旧系统，可以使用 rsa：
  ```bash
  ssh-keygen -t rsa -b 4096 -C "your_email@example.com" -f ~/.ssh/id_project1
  ```

## 2. 配置 SSH Config

创建或编辑 `~/.ssh/config` 文件：

```bash
# 如果文件不存在，创建它
touch ~/.ssh/config
```

添加以下配置：

```text
# 项目1配置
Host github-project1
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_project1
    
# 项目2配置
Host github-project2
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_project2
```

## 3. 设置正确的文件权限

```bash
# 设置私钥权限
chmod 600 ~/.ssh/id_project1
chmod 600 ~/.ssh/id_project2

# 设置公钥权限
chmod 644 ~/.ssh/id_project1.pub
chmod 644 ~/.ssh/id_project2.pub

# 设置配置文件权限
chmod 600 ~/.ssh/config
```

## 4. 添加公钥到 GitHub

1. 复制公钥内容：
```bash
# 查看项目1的公钥
cat ~/.ssh/id_project1.pub

# 查看项目2的公钥
cat ~/.ssh/id_project2.pub
```

2. 在 GitHub 中添加公钥：
   - 访问 GitHub Settings
   - 点击 "SSH and GPG keys"
   - 点击 "New SSH key"
   - 粘贴公钥内容并设置一个描述性的标题

## 5. 配置项目仓库

修改项目的远程仓库地址：

```bash
# 查看当前远程仓库地址
git remote -v

# 修改远程仓库地址
# 项目1
git remote set-url origin git@github-project1:username/repo1.git

# 项目2
git remote set-url origin git@github-project2:username/repo2.git
```

注意：将 `username/repo1.git` 替换为实际的仓库地址。

## 6. 测试连接

测试 SSH 连接是否成功：

```bash
# 测试项目1的连接
ssh -T github-project1

# 测试项目2的连接
ssh -T github-project2
```

如果配置成功，将看到类似这样的消息：
```
Hi username! You've successfully authenticated, but GitHub does not provide shell access.
```

## 常见问题

### 1. 权限问题
如果遇到权限错误，确保：
- SSH key 文件权限正确（私钥 600，公钥 644）
- `~/.ssh` 目录权限为 700
```bash
chmod 700 ~/.ssh
```

### 2. 连接测试失败
如果连接测试失败，可以使用调试模式：
```bash
ssh -vT github-project1
```

### 3. 多个 key 冲突
如果遇到 key 冲突，确保：
- 每个项目使用了正确的 Host 配置
- remote URL 使用了正确的 Host 名称

## 参考资料

- [GitHub 官方文档：生成新的 SSH 密钥](https://docs.github.com/cn/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)
- [GitHub 官方文档：添加 SSH 密钥到 GitHub 账户](https://docs.github.com/cn/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account)
