<?php
$dir = new RecursiveDirectoryIterator('c:\xampp\htdocs\stackweb-school-report-system');
$ite = new RecursiveIteratorIterator($dir);
$files = new RegexIterator($ite, '/\.(html|css)$/', RegexIterator::MATCH);

$replacements = [
    'linear-gradient(135deg, var(--primary-red), var(--primary-gold))' => 'linear-gradient(135deg, var(--primary-green), #10b981)',
    'linear-gradient(135deg, var(--primary-gold), var(--primary-red))' => 'linear-gradient(135deg, #10b981, var(--primary-green))',
    'linear-gradient(90deg, var(--primary-red), var(--primary-gold))' => 'linear-gradient(90deg, var(--primary-green), #10b981)',
    'linear-gradient(135deg, var(--primary-gold), #fbbf24)' => 'linear-gradient(135deg, var(--primary-green), #10b981)',
    'linear-gradient(135deg, var(--primary-green), var(--primary-gold))' => 'linear-gradient(135deg, var(--primary-green), #10b981)',
    'linear-gradient(135deg, var(--primary-gold), transparent)' => 'linear-gradient(135deg, #10b981, transparent)',
    'color: var(--primary-red);' => 'color: var(--primary-green);',
    'color: var(--primary-gold);' => 'color: #10b981;',
    'border-top-color: var(--primary-gold)' => 'border-top-color: var(--primary-green)',
    'icon-gold' => 'text-success',
    'bg-warning' => 'bg-success',
    'text-warning' => 'text-success'
];

foreach($files as $file) {
    if (strpos($file->getPathname(), '\\vendor\\') !== false) continue;
    
    $content = file_get_contents($file->getPathname());
    $newContent = str_replace(array_keys($replacements), array_values($replacements), $content);
    
    if ($content !== $newContent) {
        file_put_contents($file->getPathname(), $newContent);
        echo "Updated: " . $file->getPathname() . "\n";
    }
}
