export function escapeXml(text: string): string {
    if (!text) return '';
    
    return text
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '\'');
}

export function escapeCdata(content: string): string {
    if (!content) return '';
    
    // 统一换行符为 \n
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // 处理 CDATA 中的 ]]> 序列
    content = content.replace(/\]\]>/g, ']]]]><![CDATA[>');
    
    // 处理大文本，每 1000 行插入一个 CDATA 分段
    const lines = content.split('\n');
    const chunks: string[] = [];
    const chunkSize = 1000;
    
    for (let i = 0; i < lines.length; i += chunkSize) {
        const chunk = lines.slice(i, i + chunkSize).join('\n');
        chunks.push(chunk);
    }
    
    // 确保每个chunk都被CDATA包裹
    return chunks.map(chunk => `<![CDATA[${chunk}]]>`).join('\n');
}
