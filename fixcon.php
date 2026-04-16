<?php
$dir = new RecursiveDirectoryIterator('c:\xampp\htdocs\stackweb-school-report-system');
$ite = new RecursiveIteratorIterator($dir);
$files = new RegexIterator($ite, '/\.(html|css)$/', RegexIterator::MATCH);

$replacements = [
    'color: #10b981;' => 'color: var(--primary-green);',
    'color: #10B981;' => 'color: var(--primary-green);',
    'opacity-75' => '',
    'text-muted' => 'text-dark',
    'text-secondary' => 'text-dark',
    'text-success' => 'text-success fw-bold',
    'color: #94a3b8' => 'color: #475569',
    'opacity: 0.7;' => 'opacity: 1;',
    'opacity: 0.8;' => 'opacity: 1;'
];

foreach($files as $file) {
    if (strpos($file->getPathname(), '\\vendor\\') !== false) continue;
    $content = file_get_contents($file->getPathname());
    $newContent = str_replace(array_keys($replacements), array_values($replacements), $content);
    
    if ($content !== $newContent) {
        file_put_contents($file->getPathname(), $newContent);
        echo "Fixed: " . $file->getPathname() . "\n";
    }
}
?>
